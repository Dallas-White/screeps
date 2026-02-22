import Kernel from "Kernel";
import Process, { ProcessRegistry } from "../Process";
import CreepProcess from "./CreepProcess";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";

export class RoomBootstrapProcess extends CreepProcess {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], 1, undefined, undefined]
    }

    getSpawningPriority(): number {
        return 9999999
    }


    constructor(kernel: Kernel, parent: number, roomName: string) {
        super(kernel, parent, parent)
        this.memory.roomName = roomName;
    }
    runCreep(c: Creep, creepMemory: any): void {
        if (!this.memory.room) this.memory.room = (this.kernel.getProcess(this.getParent()) as RoomManagerProcess).getRoomName()
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.roomName)
            return
        }
        if (!creepMemory.state) creepMemory.state = "mining";
        if (creepMemory.state == "mining") {
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
                creepMemory.state = "supplying"
            }


        } else if (creepMemory.state == "supplying") {
            let transferTarget = c.pos.findClosestByRange(FIND_MY_STRUCTURES, { filter: (struct) => (struct.structureType == STRUCTURE_SPAWN || struct.structureType == STRUCTURE_EXTENSION) && struct.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
            if (!transferTarget) {
                let buildTarget = c.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
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
                creepMemory.state = "mining"
            } else {
                creepMemory.state = "mining"
            }
        }
    }

    onCreepDeath(): void {
    }


    getType(): string {
        return "RoomBootstrapProcess"
    }

}

ProcessRegistry.register("RoomBootstrapProcess", RoomBootstrapProcess)



