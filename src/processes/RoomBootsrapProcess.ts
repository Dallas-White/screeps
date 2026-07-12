import Kernel from "Kernel";
import Process, { ProcessRegistry } from "../Process";
import CreepProcess from "./CreepProcess";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";
import { SpawnManager } from "SpawnManager";

interface RoomBootstrapProcessMemory {
    room: string
    source: string | undefined
}

enum BootstrapCreepState {
    FETCHING = 0,
    DEPOSITING = 1
}
interface BootstrapCreepMemory {
    state: BootstrapCreepState
}

export class RoomBootstrapProcess extends CreepProcess<RoomBootstrapProcessMemory, BootstrapCreepMemory> {


    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], 1, undefined, undefined]
    }

    getSpawningPriority(): number {
        return 999999999
    }


    constructor(kernel: Kernel, parent: SpawnManager, roomName: string) {
        super(kernel, parent, parent, { room: roomName, source: undefined })
    }
    runCreep(c: Creep, creepMemory: BootstrapCreepMemory): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        if (creepMemory.state == BootstrapCreepState.FETCHING) {
            if (!this.memory.source) {
                this.memory.source = c.pos.findClosestByRange(FIND_SOURCES)!.id
            }
            const droppedEnergy: _HasRoomPosition[] = c.room.find(FIND_DROPPED_RESOURCES, { filter: (filter) => filter.resourceType == RESOURCE_ENERGY && filter.amount > 50 });
            let containers: _HasRoomPosition[] = c.room.find(FIND_STRUCTURES, {
                filter: function (structure) {
                    if (structure.structureType == STRUCTURE_STORAGE ||
                        structure.structureType == STRUCTURE_LINK || structure.structureType == STRUCTURE_CONTAINER) {
                        if (structure.store[RESOURCE_ENERGY] > 50) return true
                    }
                    return false

                }
            });
            containers = containers.concat(droppedEnergy)
            if (containers.length > 0) {
                let closest_container = c.pos.findClosestByRange(containers)!
                let energyPickedup = 0
                let result: ScreepsReturnCode = ERR_INVALID_ARGS
                if (closest_container instanceof Structure) {
                    result = c.withdraw(closest_container, RESOURCE_ENERGY)
                    energyPickedup = Math.min((closest_container as StructureContainer).store[RESOURCE_ENERGY], c.store.getCapacity())
                } else if (closest_container instanceof Resource) {
                    energyPickedup = Math.min((closest_container.amount, c.store.getCapacity()))
                    result = c.pickup(closest_container)
                } else {
                    throw new Error("Invalid structure type")
                }
                if (result == ERR_NOT_IN_RANGE) {
                    c.moveTo(closest_container)
                }

            } else {
                let miningResult = c.harvest(Game.getObjectById(this.memory.source) as Source)
                if (miningResult == ERR_NOT_IN_RANGE) c.moveTo(Game.getObjectById(this.memory.source) as Source)
            }
            if (c.store.getFreeCapacity() == 0) {
                creepMemory.state = BootstrapCreepState.DEPOSITING
            }
        } else if (creepMemory.state == BootstrapCreepState.DEPOSITING) {
            if (c.store.getUsedCapacity() == 0) {
                creepMemory.state = BootstrapCreepState.FETCHING
                return
            }
            let transferTarget = c.pos.findClosestByRange(FIND_MY_STRUCTURES, { filter: (struct) => (struct.structureType == STRUCTURE_SPAWN || struct.structureType == STRUCTURE_EXTENSION) && struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
            if (!transferTarget) {
                let buildTarget = c.pos.findClosestByRange(FIND_CONSTRUCTION_SITES, { filter: (structure) => structure.structureType == STRUCTURE_SPAWN });
                if (!buildTarget) {
                    this.park(c)
                    return
                }
                let buildResult = c.build(buildTarget);
                if (buildResult == ERR_NOT_IN_RANGE) {
                    c.moveTo(buildTarget);
                }
                return;
            }
            let transferResult = c.transfer(transferTarget as unknown as StructureExtension, RESOURCE_ENERGY)
            if (transferResult == ERR_NOT_IN_RANGE) {
                c.moveTo(transferTarget);
            } else if (transferResult == ERR_FULL) {
                this.shutdown()
            } else if (transferResult == 0) {
                creepMemory.state = BootstrapCreepState.FETCHING
            } else {
                creepMemory.state = BootstrapCreepState.FETCHING
            }
        }
    }

    initCreepMemory(): BootstrapCreepMemory {
        return { state: BootstrapCreepState.FETCHING }
    }

    onCreepDeath(): void {
    }


    getType(): string {
        return "RoomBootstrapProcess"
    }

}

ProcessRegistry.register("RoomBootstrapProcess", RoomBootstrapProcess)



