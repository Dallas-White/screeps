import { randomBytes } from "crypto";
import Kernel from "Kernel";
import { assign } from "lodash";
import Process, { ProcessRegistry } from "Process";
import { SpawnManager } from "SpawnManager";
import { EnergyConsumer } from "utils/EnergyBalance";
import CarrierProcess from "./CarrierProcess";


export interface CarrierJobFinishedCallback extends Process {
    onCarrierJobFinished(id: LogisticsTask): void
}

export interface LogisticsAssignment {
    amount: number,
    source: Id<AnyStoreStructure> | undefined,
    dest: Id<AnyStoreStructure> | undefined,
    resource: ResourceConstant,
    id: LogisticsTaskID
}

interface LogisticsManagerMemory {
    logisticsIDCounter: number;
    logisticsTasks: StoredLogisticsTask[];
    carriers?: Pid<CarrierProcess>[];
    room: string
    scale: number
    queueEMA: number
}

type StoredLogisticsTask = {
    task: LogisticsTask,
    id: LogisticsTaskID,
    claimed: number
    done: number
}

declare global {
    type LogisticsTaskID = number & Tag.OpaqueTag<LogisticsTaskID>
    type LogisticsTask = {
        priority: number,
        amount: number,
        source: Id<AnyStoreStructure>,
        dest: Id<AnyStoreStructure> | undefined,
        resource: ResourceConstant,
        callback: Pid<CarrierJobFinishedCallback> | undefined,
    } | {
        priority: number,
        amount: number,
        source: Id<AnyStoreStructure> | undefined,
        dest: Id<AnyStoreStructure>,
        resource: ResourceConstant,
        callback: Pid<CarrierJobFinishedCallback> | undefined,
    }
}

export class LogisticsManager extends Process<LogisticsManagerMemory> implements EnergyConsumer {

    constructor(kernel: Kernel, parent: Process, room: string) {
        super(kernel, parent, {
            logisticsIDCounter: 0,
            logisticsTasks: [],
            room: room,
            scale: 2,
            queueEMA: 0
        });
        this.memory.logisticsIDCounter = 0;
        this.memory.logisticsTasks = [];
    }

    resetEnergyConsumption(): void {
        for (let x of this.memory.carriers!) {
            this.kernel.getProcess(x)!.resetEnergyConsumption()
        }
    }
    getConsumptionTimer(): number {
        return this.kernel.getProcess(this.memory.carriers![0])!.getConsumptionTimer()
    }
    getAverageEnergyConsumption(): number {
        return _.sum(this.memory.carriers!.map((x) => this.kernel.getProcess(x)?.getAverageEnergyConsumption())) / 2
    }

    getRoom() {
        return this.memory.room
    }

    addLogisticTask(t: LogisticsTask): LogisticsTaskID {
        this.memory.logisticsIDCounter++;
        let id = this.memory.logisticsIDCounter;
        let task: StoredLogisticsTask = {
            task: t,
            claimed: 0,
            id: id as LogisticsTaskID,
            done: 0
        }
        this.memory.logisticsTasks.push(task);
        this.memory.logisticsTasks.sort((a: StoredLogisticsTask, b: StoredLogisticsTask) => a.task.priority - b.task.priority);
        return id as LogisticsTaskID;
    }

    resizeTask(id: number, newAmount: number) {
        let taskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == id);
        this.memory.logisticsTasks[taskIdx].task.amount = newAmount + this.memory.logisticsTasks[taskIdx].done;
    }

    cancelTask(id: number) {
        this.memory.logisticsTasks = this.memory.logisticsTasks.filter((t: StoredLogisticsTask) => t.id != id);
    }

    getTask(capacity: number): LogisticsAssignment | undefined {
        for (let x of this.memory.logisticsTasks) {
            if ((x.task.amount - x.claimed - x.done) > 0) {
                let assignedAmount = Math.min(capacity, x.task.amount - x.claimed - x.done);
                if (x.task.source) {
                    let sourceAmount = Game.getObjectById(x.task.source)?.store[x.task.resource]
                    if (!sourceAmount || sourceAmount < assignedAmount)
                        continue
                }
                if (x.task.dest) {
                    let destAmount = Game.getObjectById(x.task.dest)?.store.getFreeCapacity(x.task.resource)
                    if (!destAmount || destAmount == 0) continue

                    if (destAmount && destAmount < assignedAmount)
                        assignedAmount = destAmount
                }
                x.claimed += assignedAmount;
                return {
                    amount: assignedAmount,
                    source: x.task.source,
                    dest: x.task.dest,
                    resource: x.task.resource,
                    id: x.id
                }
            }
        }
        return undefined
    }

    /* this handles getting a new logistics assignment when the old one's destination is full or the source does not have enough */
    swapAssignment(currentAssignment: LogisticsAssignment, capacity: number): LogisticsAssignment | undefined {
        let currentTaskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == currentAssignment.id);
        if (currentTaskIdx != -1)
            this.memory.logisticsTasks[currentTaskIdx].claimed -= currentAssignment.amount
        return this.getTask(capacity)
    }

    /*this function handles canceling an assignment, it is called when a creep died*/
    returnAssignment(currentAssignment: LogisticsAssignment) {
        let currentTaskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == currentAssignment.id);
        if (currentTaskIdx != -1) {
            this.memory.logisticsTasks[currentTaskIdx].claimed -= currentAssignment.amount
        }
    }

    completeAssignment(assignment: LogisticsAssignment) {
        let taskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == assignment.id);
        this.memory.logisticsTasks[taskIdx].claimed -= assignment.amount
        this.memory.logisticsTasks[taskIdx].done += assignment.amount
        if (this.memory.logisticsTasks[taskIdx].task.amount - this.memory.logisticsTasks[taskIdx].done <= 0) {
            if (this.memory.logisticsTasks[taskIdx].task.callback != undefined) {
                this.kernel.getProcess(this.memory.logisticsTasks[taskIdx].task.callback!)!.onCarrierJobFinished(this.memory.logisticsTasks[taskIdx].task)
            }
            this.memory.logisticsTasks.splice(taskIdx)
        }
    }

    getRemaining(id: LogisticsTaskID): number {
        let taskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == id);
        return this.memory.logisticsTasks[taskIdx].task.amount - this.memory.logisticsTasks[taskIdx].done
    }
    run(): void {
        if (!this.memory.carriers) {
            let carrierScale = Math.ceil(this.memory.scale / 2)
            let c1 = new CarrierProcess(this.kernel, this, this, this.getParent() as SpawnManager, carrierScale)
            let c2 = new CarrierProcess(this.kernel, this, this, this.getParent() as SpawnManager, carrierScale)
            c2.sleep(CREEP_LIFE_TIME / 2);
            this.kernel.addProcess(c1);
            this.kernel.addProcess(c2)
            this.memory.carriers = [c1.getPID(), c2.getPID()];
            return
        }
        let queueSize = _.sum(this.memory.logisticsTasks.map((x) => x.task.amount - x.claimed - x.done))
        this.memory.queueEMA = this.memory.queueEMA * 0.8 + queueSize * 0.2
        if (Game.time % 1000 == 0) {
            if (this.memory.queueEMA > 5) {
                this.memory.scale += 1
                this.memory.scale = Math.min(6, this.memory.scale)
            } else if (this.memory.queueEMA < 0.1) {
                this.memory.scale -= 1
                this.memory.scale = Math.max(2, this.memory.scale)
            }
            for (let x of this.memory.carriers) {
                this.kernel.getProcess(x)!.setScale(Math.ceil(this.memory.scale / 2))
            }
        }
    }

    getType(): string {
        return "LogisticsManager"
    }

}

ProcessRegistry.register("LogisticsManager", LogisticsManager);