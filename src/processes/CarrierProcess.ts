import CreepProcess from "./CreepProcess";

import Process, { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";
import { drop } from "lodash";

export default class CarrierProcess extends CreepProcess {

    runCreep(c: Creep, creepMemory: any): void {
        if (!this.memory.room) this.memory.room = (this.kernel.getProcess(this.getParent()) as RoomManagerProcess).getRoomName()
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        if(!creepMemory.state) creepMemory.state = "fetching"
        let jobs = [new RefillPriorityJob(), new DroppedEnergyToStorageJob(), new SourceToRemoteContainersJob(), new SourceToStorage(), new SourceToTerminal()]
        if(!creepMemory.currentJobIdx) {
            for (let job in jobs) {
                if (jobs[job].checkJob(c)) {
                    creepMemory.currentJobIdx = job
                    break
                }
            }
        }
        if (!creepMemory.currentJobIdx) {
            this.park(c);
            return;
        }
        let job = jobs[creepMemory.currentJobIdx]
        if (creepMemory.state == "fetching") {
            if (c.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                creepMemory.state = "depositing"
                return
            }
            let needsNewFetch = false
            if (creepMemory.fetchTarget) {
                let fetchTarget = Game.getObjectById(creepMemory.fetchTarget)
                if (!fetchTarget || (fetchTarget instanceof Structure && (fetchTarget as StructureStorage).store.getUsedCapacity(RESOURCE_ENERGY) < 50)
                    || (fetchTarget instanceof Resource && (fetchTarget as Resource).amount < 50)) {
                        needsNewFetch = true
                }
            } else {
                needsNewFetch = true
            }
            if (needsNewFetch) {
                let newFetchTarget = job.getSource(c)
                if (!newFetchTarget) {
                    creepMemory.fetchTarget = undefined
                    creepMemory.destination = undefined
                    creepMemory.currentJobIdx = undefined
                    return
                }
                creepMemory.fetchTarget = newFetchTarget.id
            }
            let fetchTarget = Game.getObjectById(creepMemory.fetchTarget)
            let returnCode: ScreepsReturnCode = ERR_INVALID_ARGS
            if (fetchTarget instanceof Structure) {
                returnCode = c.withdraw(fetchTarget, RESOURCE_ENERGY)
            } else if (fetchTarget instanceof Resource) {
                returnCode = c.pickup(fetchTarget)
            }
            if(returnCode == ERR_NOT_IN_RANGE) {
                c.moveTo((fetchTarget as unknown as _HasRoomPosition))
            } else if (returnCode == OK) {
                creepMemory.state = "depositing"
            }
        } else {
            let needsNewDestination = false
            if (creepMemory.destination) {
                let destination = Game.getObjectById(creepMemory.destination)
                if (!destination || (destination as StructureStorage).store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                    needsNewDestination = true
                }
            } else {
                needsNewDestination = true
            }

            if (needsNewDestination) {
                let newDestination = job.getDestination(c)
                if (!newDestination) {
                    creepMemory.currentJobIdx = undefined
                    creepMemory.fetchTarget = undefined
                    creepMemory.destination = undefined
                    return
                }
                creepMemory.destination = newDestination.id
            }
            let destination = Game.getObjectById(creepMemory.destination)
            let returnCode = c.transfer(destination as Structure, RESOURCE_ENERGY)
            if(returnCode == ERR_NOT_IN_RANGE) {
                c.moveTo((destination as unknown as _HasRoomPosition))
            } else {
                if(c.store.getUsedCapacity() == 0) creepMemory.state = "fetching"
                creepMemory.currentJobIdx = undefined
                creepMemory.fetchTarget = undefined
                creepMemory.destination = undefined
            }
        }
    }

    onCreepDeath(): void {
        return
    }
    constructor(kernel: Kernel, parent: number) {
        super(kernel, parent, parent)
        this.memory.scale = 1
    }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        if(!this.memory.scale) this.memory.scale = 3
        return [[MOVE, CARRY, CARRY], this.memory.scale ,[], undefined]
    }

    getScale(): number {
        return this.memory.scale
    }

    setScale(n: number) {
        this.memory.scale = n
    }

    getSpawningPriority(): number {
        return 100
    }

    getType(): string {
        return "CarrierProcess"
    }


}
ProcessRegistry.register("CarrierProcess", CarrierProcess)

abstract class CarrierJob {
    checkJob(c: Creep): boolean {
        return this.getSource(c) != undefined && this.getDestination(c) != undefined;
    }
    abstract getSource(c: Creep): Structure | Resource |  undefined
    abstract getDestination(c: Creep): Structure | undefined
}

class RefillPriorityJob extends CarrierJob{

    getSource(creep: Creep): Structure | Resource | undefined {
        let droppedEnergy: _HasRoomPosition[] = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (filter) => filter.resourceType == RESOURCE_ENERGY && filter.amount > 50});
        let containers: _HasRoomPosition[] = creep.room.find(FIND_STRUCTURES, {
            filter: function (structure) {
                if (structure.structureType == STRUCTURE_STORAGE ||
                    structure.structureType == STRUCTURE_LINK || structure.structureType == STRUCTURE_CONTAINER) {
                        if(structure.store[RESOURCE_ENERGY] > 50) return true
                }
                return false

            }
        });
        containers = containers.concat(droppedEnergy)
        let closest_container = creep.pos.findClosestByRange(containers)
        if (closest_container == null) return undefined;
        return closest_container as Resource | Structure
    }
    getDestination(c: Creep): Structure | undefined {
        let needsFilled = c.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => (structure.structureType == STRUCTURE_SPAWN
                || structure.structureType == STRUCTURE_TOWER || structure.structureType == STRUCTURE_EXTENSION)
                && structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
        })
        let closestJob = c.pos.findClosestByRange(needsFilled)
        return closestJob? closestJob: undefined


    }

}

class DroppedEnergyToStorageJob extends CarrierJob {

    getSource(c: Creep) {
        const dropped = c.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
            filter: res => res.resourceType === RESOURCE_ENERGY && res.amount > 0
        });
        return dropped? dropped : undefined
    }

    getDestination(c: Creep) {
        const target = c.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s =>
                (s.structureType === STRUCTURE_CONTAINER) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                c.room.find(FIND_MINERALS).every(spawn => spawn.pos.getRangeTo(s) > 1)
        });
        return target? target : undefined
    }
}

class SourceToRemoteContainersJob extends CarrierJob {

    getSource(c: Creep) {
        let source = c.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 0 &&
                c.room.find(FIND_SOURCES).some(spawn => spawn.pos.getRangeTo(s) <= 1)
        });
        return source? source : undefined
    }

    getDestination(c: Creep) {

        const target = c.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s =>
                (s.structureType === STRUCTURE_CONTAINER) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                c.room.find(FIND_SOURCES).every(spawn => spawn.pos.getRangeTo(s) > 1) &&
                c.room.find(FIND_MINERALS).every(spawn => spawn.pos.getRangeTo(s) > 1)
        });
        return target? target : undefined
    }
}

class SourceToStorage extends CarrierJob {

    getSource(c: Creep) {
        const source = c.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s =>
                ((s.structureType === STRUCTURE_CONTAINER &&
                    c.room.find(FIND_SOURCES).some(spawn => spawn.pos.getRangeTo(s) <= 1)) || s.structureType == STRUCTURE_LINK) &&
                s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        })
        return source ? source : undefined
    }

    getDestination(c: Creep) {

        if(c.room.storage && c.room.storage.store[RESOURCE_ENERGY] > 500000) return undefined
        return c.room.storage
    }
}

class SourceToTerminal extends CarrierJob {

    getSource(c: Creep) {
        const source = c.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 0 &&
                c.room.find(FIND_SOURCES).some(spawn => spawn.pos.getRangeTo(s) <= 1)
        });
        return source? source : undefined
    }

    getDestination(c: Creep) {
        return c.room.terminal
    }
}
