import CreepProcess from "./CreepProcess";

import Process, { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";
import { drop } from "lodash";
import { SpawnManager } from "SpawnManager";
import { LogisticsAssignment, LogisticsEndpoint, LogisticsManager } from "./LogisticsManager";

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

function GreedyPathing(startingPos: RoomPosition, stops: Array<LogisticsEndpoint>): LogisticsEndpoint[] {
    let newStops: Array<LogisticsEndpoint> = []
    let currentPos: undefined | RoomPosition = startingPos
    while (stops.length > 0) {
        let closestRange = 99
        let closestIndex = 0
        if (currentPos != undefined) {
            for (let s in stops) {
                if (!stops[s].location) continue;
                let range = currentPos.getRangeTo(Game.getObjectById(stops[s].location!)!.pos)
                if (range < closestRange) {
                    closestIndex = +s
                    closestRange = range
                }
            }
        }
        newStops.push(stops[closestIndex])
        currentPos = stops[closestIndex].location ? Game.getObjectById(stops[closestIndex].location!)?.pos : undefined
        stops.splice(closestIndex, 1)
    }
    return newStops
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
                for (let x of RESOURCES_ALL) {
                    if (c.store.getUsedCapacity(x) > 0) {
                        c.drop(x)
                        return
                    }
                }
            } else {
                creepMemory.state = CarrierCreepState.FETCHING
                creepMemory.assignment = this.kernel.getProcess(this.memory.logisticsManager)?.getTask(c.store.getFreeCapacity())
            }

        }
        if (!creepMemory.assignment) {
            return
        }
        if (creepMemory.state == CarrierCreepState.FETCHING) {
            if (creepMemory.assignment.source.length == 0) {
                creepMemory.state = CarrierCreepState.DEPOSITING
                return
            }
            let source: AnyStoreStructure | Resource
            if (creepMemory.assignment.source[0].location && Game.getObjectById(creepMemory.assignment.source[0].location)) {
                source = Game.getObjectById(creepMemory.assignment.source[0].location)!
            } else if (c.room.storage && c.room.storage.store[creepMemory.assignment.source[0].resource] >= creepMemory.assignment.source[0].amount) {
                source = c.room.storage
            } else {
                let containers = c.room.find(FIND_STRUCTURES, { filter: (s) => (s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_LINK) && (!creepMemory.assignment?.source[0].amount || s.store[creepMemory.assignment?.source[0].resource] > creepMemory.assignment?.source[0].amount) })
                if (containers.length == 0) {
                    let dropped_resources = c.room.find(FIND_DROPPED_RESOURCES, { filter: (s) => s.resourceType == creepMemory.assignment?.source[0].resource })
                    if (dropped_resources.length == 0) {
                        for (let x of creepMemory.assignment.source) {
                            this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                        }
                        for (let x of creepMemory.assignment.dest) {
                            this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                        }
                        creepMemory.assignment = undefined
                        creepMemory.state = CarrierCreepState.FETCHING
                        return
                    }
                    source = c.pos.findClosestByRange(dropped_resources)!
                } else {
                    source = c.pos.findClosestByRange(containers) as StructureContainer
                }
            }
            let amountAvailable = source instanceof Resource ? source.amount : source.store[creepMemory.assignment.source[0].resource]
            if (amountAvailable < creepMemory.assignment.source[0].amount) {
                for (let x of creepMemory.assignment.source) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                for (let x of creepMemory.assignment.dest) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                creepMemory.state = CarrierCreepState.FETCHING
                creepMemory.assignment = undefined
                return
            }
            let withdrawCode = source instanceof Resource ? c.pickup(source) : c.withdraw(source, creepMemory.assignment.source[0].resource, creepMemory.assignment.source[0].amount)
            if (withdrawCode == OK || withdrawCode == ERR_FULL) {
                this.kernel.getProcess(this.memory.logisticsManager)?.completeAssignment(creepMemory.assignment.source[0]);
                creepMemory.assignment.source.shift()
                if (creepMemory.assignment.source.length == 0) {
                    creepMemory.state = CarrierCreepState.DEPOSITING
                    creepMemory.assignment.dest = GreedyPathing(c.pos, creepMemory.assignment.dest)
                }
            } else if (withdrawCode == ERR_NOT_IN_RANGE) {
                c.moveTo(source)
            } else {
                for (let x of creepMemory.assignment.source) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                for (let x of creepMemory.assignment.dest) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                creepMemory.state = CarrierCreepState.FETCHING
                creepMemory.assignment = undefined
                console.log("ERROR: bad withdraw case: " + withdrawCode)
            }
        } else if (creepMemory.state == CarrierCreepState.DEPOSITING) {
            if (c.store.getUsedCapacity() == 0) {
                creepMemory.state = CarrierCreepState.FETCHING
            }
            let dest: AnyStoreStructure
            if (creepMemory.assignment.dest[0].location && Game.getObjectById(creepMemory.assignment.dest[0].location)) {
                dest = Game.getObjectById(creepMemory.assignment.dest[0].location)!
            } else if (c.room.storage && c.room.storage.store.getFreeCapacity() >= creepMemory.assignment.dest[0].amount) {
                dest = c.room.storage
            } else {
                let containers = c.room.find(FIND_STRUCTURES, { filter: (s) => (s.structureType == STRUCTURE_LINK) && !s.isSourceStructure && creepMemory.assignment!.dest[0].amount >= (s.store.getFreeCapacity(creepMemory.assignment!.dest[0].resource) ?? 0) })
                if (containers.length == 0) {
                    for (let x of creepMemory.assignment.source) {
                        this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                    }
                    for (let x of creepMemory.assignment.dest) {
                        this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                    }
                    creepMemory.state = CarrierCreepState.FETCHING
                    creepMemory.assignment = undefined
                    return
                }
                dest = containers[0] as StructureContainer
            }
            /*if (dest.store.getFreeCapacity(creepMemory.assignment.resource) == null || dest.store.getFreeCapacity(creepMemory.assignment.resource)! < creepMemory.assignment.amount) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment)
                creepMemory.assignment = undefined
                return
            }*/
            let returnCode = c.transfer(dest, creepMemory.assignment.dest[0].resource, Math.min(creepMemory.assignment.dest[0].amount, dest.store.getFreeCapacity(creepMemory.assignment.dest[0].resource)!));
            if (returnCode == OK) {
                this.kernel.getProcess(this.memory.logisticsManager)?.completeAssignment(creepMemory.assignment.dest[0])
                creepMemory.assignment.dest.shift()
                if (creepMemory.assignment.dest.length == 0) {
                    creepMemory.assignment = undefined
                    creepMemory.state = CarrierCreepState.FETCHING
                }
            } else if (returnCode == ERR_FULL) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(creepMemory.assignment.dest[0])
                creepMemory.assignment.dest.shift()
                if (creepMemory.assignment.dest.length == 0) {
                    creepMemory.assignment = undefined
                    creepMemory.state = CarrierCreepState.FETCHING
                }
            } else if (returnCode == ERR_NOT_IN_RANGE) {
                c.moveTo(dest)
            } else {
                for (let x of creepMemory.assignment.source) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                for (let x of creepMemory.assignment.dest) {
                    this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
                }
                creepMemory.state = CarrierCreepState.FETCHING
                creepMemory.assignment = undefined
                return
            }
        }
    }

    onCreepDeath(creepMemory: CarrierCreepMemory): void {
        if (creepMemory.assignment) {
            for (let x of creepMemory.assignment.source) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
            }
            for (let x of creepMemory.assignment.dest) {
                this.kernel.getProcess(this.memory.logisticsManager)?.returnAssignment(x);
            }
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

