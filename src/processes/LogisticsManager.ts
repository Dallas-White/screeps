import { randomBytes } from "crypto";
import Kernel from "Kernel";
import { assign, pull } from "lodash";
import Process, { ProcessRegistry } from "Process";
import { SpawnManager } from "SpawnManager";
import { EnergyConsumer } from "utils/EnergyBalance";
import CarrierProcess from "./CarrierProcess";


export interface CarrierJobFinishedCallback extends Process {
    onCarrierJobFinished(task: LogisticsTask, id: LogisticsTaskID): void
}

export interface LogisticsEndpoint {
    location: Id<AnyStoreStructure> | undefined
    id: LogisticsTaskID | undefined,
    resource: ResourceConstant,
    amount: number
}

export interface LogisticsAssignment {
    source: Array<LogisticsEndpoint>
    dest: Array<LogisticsEndpoint>
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
        this.memory.logisticsTasks.sort((a: StoredLogisticsTask, b: StoredLogisticsTask) => b.task.priority - a.task.priority);
        return id as LogisticsTaskID;
    }

    resizeTask(id: LogisticsTaskID, newAmount: number) {
        let taskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == id);
        this.memory.logisticsTasks[taskIdx].task.amount = newAmount + this.memory.logisticsTasks[taskIdx].done;
    }

    cancelTask(id: LogisticsTaskID) {
        this.memory.logisticsTasks = this.memory.logisticsTasks.filter((t: StoredLogisticsTask) => t.id != id);
    }

    getTask(capacity: number): LogisticsAssignment | undefined {
        let pullAmount: Partial<Record<ResourceConstant, number>> = {}
        let pushAmount: Partial<Record<ResourceConstant, number>> = {}
        let remaining = capacity
        let sources: Array<LogisticsEndpoint> = []
        let destinations: Array<LogisticsEndpoint> = []

        for (let x of this.memory.logisticsTasks) {
            if (remaining <= 0) break
            let pending = x.task.amount - x.claimed - x.done
            if (pending <= 0) continue

            if (sources.length > 0 && sources[0].resource !== x.task.resource) continue
            if (sources.length > 0 && !!x.task.source !== !!sources[0].location) continue

            let assigned = Math.min(remaining, pending)

            if (x.task.source) {
                let have = Game.getObjectById(x.task.source)?.store[x.task.resource]
                if (!have || have < assigned) continue
            }

            if (x.task.dest) {
                let have = Game.getObjectById(x.task.dest)?.store.getFreeCapacity(x.task.resource)
                if (!have || have === 0) continue
                if (have < assigned) assigned = have
            }

            x.claimed += assigned
            remaining -= assigned
            if (x.task.source) {
                sources.push({ amount: assigned, location: x.task.source, id: x.task.dest ? undefined : x.id, resource: x.task.resource })
            } else {
                pullAmount[x.task.resource] = (pullAmount[x.task.resource] ?? 0) + assigned
            }
            if (x.task.dest) {
                destinations.push({ amount: assigned, location: x.task.dest, id: x.id, resource: x.task.resource })
            } else {
                pushAmount[x.task.resource] = (pushAmount[x.task.resource] ?? 0) + assigned
            }
        }
        if (sources.length === 0 && Object.keys(pullAmount).length == 0) return undefined
        if (Object.keys(pullAmount).length > 0) {
            for (let x of Object.keys(pullAmount)) {
                sources.push({ amount: pullAmount[x as ResourceConstant]!, location: undefined, id: undefined, resource: x as ResourceConstant })
            }
        }
        if (Object.keys(pushAmount).length > 0) {
            for (let x of Object.keys(pushAmount)) {
                destinations.push({ amount: pushAmount[x as ResourceConstant]!, location: undefined, id: undefined, resource: x as ResourceConstant })
            }
        }
        return { source: sources, dest: destinations }
    }
    /*this function handles canceling an assignment, it is called when a creep died*/
    returnAssignment(currentAssignment: LogisticsEndpoint) {
        if (currentAssignment.id == undefined) return;
        let currentTaskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == currentAssignment.id);
        if (currentTaskIdx != -1) {
            this.memory.logisticsTasks[currentTaskIdx].claimed -= currentAssignment.amount
        }
    }

    completeAssignment(assignment: LogisticsEndpoint) {
        if (assignment.id == undefined) return;
        let taskIdx = this.memory.logisticsTasks.findIndex((t: StoredLogisticsTask) => t.id == assignment.id);
        if (taskIdx == -1) return;
        this.memory.logisticsTasks[taskIdx].claimed -= assignment.amount
        this.memory.logisticsTasks[taskIdx].done += assignment.amount
        if (this.memory.logisticsTasks[taskIdx].task.amount - this.memory.logisticsTasks[taskIdx].done <= 0) {
            if (this.memory.logisticsTasks[taskIdx].task.callback != undefined) {
                this.kernel.getProcess(this.memory.logisticsTasks[taskIdx].task.callback!)!.onCarrierJobFinished(this.memory.logisticsTasks[taskIdx].task, this.memory.logisticsTasks[taskIdx].id)
            }
            this.memory.logisticsTasks.splice(taskIdx, 1)
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

        if (Game.time % 5000 == 0) {
            let totalUtilization = _.sum(this.memory.carriers.map((c) => this.kernel.getProcess(c)?.getTotalUtilizationTicks()))
            if (totalUtilization > 8000) {
                let ute = this.memory.carriers.map((c) => this.kernel.getProcess(c)?.getUtilization())
                let sum = 0
                for (let z of ute) {
                    sum += z || 0
                }
                let utilization = sum / ute.length;
                if (utilization > 0.9) {
                    this.memory.scale += 1
                } else if (utilization < 0.5) {
                    this.memory.scale -= 1
                }
                for (let x in this.memory.carriers) {
                    let proc = this.kernel.getProcess(this.memory.carriers[x])
                    proc?.resetUtilization()
                    let newScale = this.memory.scale / this.memory.carriers.length;
                    newScale = Number(x) == 0 ? Math.floor(newScale) : Math.ceil(newScale);
                    proc?.setScale(Math.floor(this.memory.scale))
                }
                this.memory.scale = Math.max(this.memory.scale, 2)
                this.memory.scale = Math.min(this.memory.scale, 10)
            }
        }
    }

    getType(): string {
        return "LogisticsManager"
    }

}

ProcessRegistry.register("LogisticsManager", LogisticsManager);