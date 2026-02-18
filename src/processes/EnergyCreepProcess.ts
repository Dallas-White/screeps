import { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import { Position } from "source-map";
import {EnergyConsumer} from "../utils/EnergyBalance"
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { moveToRoom } from "utils/creepUtils";

export enum actResult {
    CONTINUE,
    SELECTNEW
}

const TICKS_TO_LIVE_MIN = 100

abstract class EnergyCreepProcess extends CreepProcess {

    constructor(kernel: Kernel, parent: number, spawnManager: number, roomName: string) {
        super(kernel, parent, spawnManager)
        this.memory.room = roomName
    }

    abstract act(creep: Creep, target: _HasId, creepMemory: any): actResult

    onCreepDeath(): void {
        this.memory.__ecState = "fetching"
        this.memory.__ecTarget = undefined
    }

    abstract killOnNoTarget(): boolean;


    gatherEnergy(creep: Creep, creepMemory: any) {
        let fetchTarget = Game.getObjectById(creepMemory.__fetchTarget)
        if (!fetchTarget
            || (fetchTarget instanceof Structure
                && (fetchTarget as StructureContainer).store[RESOURCE_ENERGY] < 50)
            || (fetchTarget instanceof Resource
                && (fetchTarget as Resource).amount < 50)) {

            const droppedEnergy: _HasRoomPosition[] = creep.room.find(FIND_DROPPED_RESOURCES, { filter: (filter) => filter.resourceType == RESOURCE_ENERGY && filter.amount > 50 });
            let containers: _HasRoomPosition[] = creep.room.find(FIND_STRUCTURES, {
                filter: function (structure) {
                    if (structure.structureType == STRUCTURE_STORAGE ||
                        structure.structureType == STRUCTURE_LINK || structure.structureType == STRUCTURE_CONTAINER) {
                        if (structure.store[RESOURCE_ENERGY] > 50) return true
                    }
                    return false

                }
            });
            containers = containers.concat(droppedEnergy)
            creepMemory.__fetchTarget = (creep.pos.findClosestByPath(containers) as unknown as _HasId)?.id
        }

        if(creepMemory.__fetchTarget) {
            let closest_container = Game.getObjectById(creepMemory.__fetchTarget)
            let energyPickedup = 0
            let result:ScreepsReturnCode = ERR_INVALID_ARGS
            if (closest_container instanceof Structure) {
                result = creep.withdraw(closest_container, RESOURCE_ENERGY)
                energyPickedup = Math.min((closest_container as StructureContainer).store[RESOURCE_ENERGY], creep.store.getCapacity())
            } else if (closest_container instanceof Resource) {
                energyPickedup = Math.min((closest_container.amount, creep.store.getCapacity()))
                result = creep.pickup(closest_container)
            } else {
                throw new Error("Invalid structure type")
            }
            if (result == ERR_NOT_IN_RANGE) {
                creep.moveTo(closest_container)
            } else if (result == OK) {
                creepMemory.__fetchTarget = undefined
                this.logEnergyConsumption(energyPickedup)
            }
        }
    }

    abstract selectTarget(pos: RoomPosition): _HasId | null


    runCreep(creep: Creep, creepMemory: any): void {
        if(!this.memory.room) this.memory.room = (this.kernel.getProcess(this.getParent()) as RoomManagerProcess).getRoomName()
        if (creep.room.name != this.memory.room && !creepMemory.__roomTraveledTo) {
            moveToRoom(creep, this.memory.room)
            return
        } else {
            creepMemory.__roomTraveledTo = true
        }
        if (creepMemory.__ecState == "running") {
            if (!creepMemory.__ecTarget || !Game.getObjectById(creepMemory.__ecTarget)) {
                let target = this.selectTarget(creep.pos);
                if (!target) {
                    if (this.killOnNoTarget()) {
                        this.shutdown()
                    }
                    return
                }
                creepMemory.__ecTarget = target.id;
            }
            let result = this.act(creep, Game.getObjectById(creepMemory.__ecTarget)!, creepMemory)
            if (result == actResult.SELECTNEW) {
                let target = this.selectTarget(creep.pos);
                if (!target) {
                    if (this.killOnNoTarget()) {
                        this.shutdown()
                        return
                    }
                    this.park(creep);
                    return
                }
                creepMemory.__ecTarget = target.id;
            }
            if (creep.store[RESOURCE_ENERGY] == 0) {
                creepMemory.__ecState = "fetching"
                creepMemory.__ecTarget = undefined
            }
        } else {
            if (creep.ticksToLive! <= TICKS_TO_LIVE_MIN) {
                creep.suicide()
                return
            }
            this.gatherEnergy(creep, creepMemory)
            if (creep.store.getFreeCapacity() == 0) {
                creepMemory.__ecState = "running"
                creepMemory.__fetchTarget = undefined
            }
        }
    }
}

export default EnergyCreepProcess;
