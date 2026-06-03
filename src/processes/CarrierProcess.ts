import CreepProcess from "./CreepProcess";

import Process, { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";
import { drop } from "lodash";
import { SpawnManager } from "SpawnManager";
import { LogisticsAssignment, LogisticsManager } from "./LogisticsManager";

enum CarrierCreepState {
    FETCHING = 0,
    DEPOSITING = 1
}
interface CarrierCreepMemory {
    assignment: LogisticsAssignment | undefined
    state: CarrierCreepState
}

interface CarrierProcessMemory {
    logisticsManager: Pid<LogisticsManager>
    scale: number
    room: string
}

export default class CarrierProcess extends CreepProcess<CarrierProcessMemory, CarrierCreepMemory> {

    constructor(kernel: Kernel, parent: Process, logisticsManager: LogisticsManager, spawnManager: SpawnManager, scale: number) {
        super(kernel, parent, spawnManager, {
            logisticsManager: logisticsManager.getPID(),
            scale: 1,
            room: logisticsManager.getRoom()
        })
    }

    setScale(scale: number) {
        this.memory.scale = scale
    }

    initCreepMemory(): CarrierCreepMemory {
        return { assignment: undefined, state: CarrierCreepState.FETCHING }
    }
    getSpawningPriority(): number {
        return 10000
    }
    runCreep(c: Creep, creepMemory: CarrierCreepMemory): void {
        if (!creepMemory.assignment) {
            if (c.store.getUsedCapacity() != 0) {
                let dest: AnyStoreStructure;
                if (c.room.storage && c.room.storage.store.getFreeCapacity() >= c.store.getUsedCapacity()) {
                    dest = c.room.storage
                } else {
                    let containers = c.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store.getFreeCapacity() >= c.store.getUsedCapacity() })
                    if (containers.length == 0) {
                        for (let x of RESOURCES_ALL) {
                            if (c.store.getUsedCapacity(x) > 0) {
                                c.drop(x)
                                return
                            }
                        }
                    }
                    dest = c.pos.findClosestByRange(containers) as AnyStoreStructure
                }
                for (let x of RESOURCES_ALL) {
                    if (c.store.getUsedCapacity(x) > 0) {
                        if (c.transfer(dest, x) == ERR_NOT_IN_RANGE) {
                            c.moveTo(dest)
                        }
                        return
                    }
                }
            } else {
                creepMemory.assignment = this.kernel.getProcess(this.memory.logisticsManager)?.getTask(c.store.getFreeCapacity())
                creepMemory.state = CarrierCreepState.FETCHING
            }

        }
        if (!creepMemory.assignment) return
        if (creepMemory.state == CarrierCreepState.FETCHING) {
            let source: AnyStoreStructure | Resource
            if (creepMemory.assignment.source && Game.getObjectById(creepMemory.assignment.source)) {
                source = Game.getObjectById(creepMemory.assignment.source)!
            } else if (c.room.storage && c.room.storage.store[creepMemory.assignment.resource] >= creepMemory.assignment.amount) {
                source = c.room.storage
            } else {
                let containers = c.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER && (!creepMemory.assignment?.amount || s.store[creepMemory.assignment?.resource] > creepMemory.assignment?.amount) })
                if (containers.length == 0) {
                    let dropped_resources = c.room.find(FIND_DROPPED_RESOURCES, { filter: (s) => s.resourceType == creepMemory.assignment?.resource })
                    if (dropped_resources.length == 0) {
                        this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment)
                        creepMemory.assignment = undefined
                        return
                    }
                    source = dropped_resources[0]
                } else {
                    source = containers[0] as StructureContainer
                }
            }
            let amountAvailable = source instanceof Resource ? source.amount : source.store[creepMemory.assignment.resource]
            if (amountAvailable < creepMemory.assignment.amount) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment)
                creepMemory.assignment = undefined
                return
            }
            let withdrawCode = source instanceof Resource ? c.pickup(source) : c.withdraw(source, creepMemory.assignment.resource, creepMemory.assignment.amount)
            if (withdrawCode == OK) {
                creepMemory.state = CarrierCreepState.DEPOSITING
            } else if (withdrawCode == ERR_NOT_IN_RANGE) {
                c.moveTo(source)
            }
        } else if (creepMemory.state = CarrierCreepState.DEPOSITING) {
            let dest: AnyStoreStructure
            if (creepMemory.assignment.dest && Game.getObjectById(creepMemory.assignment.dest)) {
                dest = Game.getObjectById(creepMemory.assignment.dest)!
            } else if (c.room.storage && c.room.storage.store.getFreeCapacity() >= creepMemory.assignment.amount) {
                dest = c.room.storage
            } else {
                let containers = c.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER && !s.isSourceStructure && creepMemory.assignment!.amount >= s.store.getFreeCapacity() })
                if (containers.length == 0) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment)
                    creepMemory.assignment = undefined
                    return
                }
                dest = containers[0] as StructureContainer
            }
            if (dest.store.getFreeCapacity(creepMemory.assignment.resource) == null || dest.store.getFreeCapacity(creepMemory.assignment.resource)! < creepMemory.assignment.amount) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment)
                creepMemory.assignment = undefined
                return
            }
            let returnCode = c.transfer(dest, creepMemory.assignment.resource, creepMemory.assignment.amount)
            if (returnCode == OK) {
                this.kernel.getProcess(this.memory.logisticsManager)?.completeAssignment(creepMemory.assignment)
                creepMemory.assignment = undefined
                creepMemory.state = CarrierCreepState.FETCHING
            } else if (returnCode == ERR_NOT_IN_RANGE) {
                c.moveTo(dest)
            }
        }
    }

    onCreepDeath(creepMemory: CarrierCreepMemory): void {
        if (creepMemory.assignment) {
            this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment);
        }
    }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: BodyPartConstant[] | undefined, maxCreeps: number | undefined] {
        return [[MOVE, CARRY, CARRY], this.memory.scale, undefined, undefined]
    }

    getType(): string {
        return "CarrierProcess"
    }

}
ProcessRegistry.register("CarrierProcess", CarrierProcess)

