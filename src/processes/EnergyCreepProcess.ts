import { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import { Position } from "source-map";
import { EnergyConsumer } from "../utils/EnergyBalance"
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { gatherEnergy, moveToRoom } from "utils/creepUtils";

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


    abstract selectTarget(pos: RoomPosition): _HasId | null


    runCreep(creep: Creep, creepMemory: any): void {
        if (!this.memory.room) this.memory.room = (this.kernel.getProcess(this.getParent()) as RoomManagerProcess).getRoomName()
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
            this.logEnergyConsumption(gatherEnergy(creep, creepMemory))
            if (creep.store.getFreeCapacity() == 0) {
                creepMemory.__ecState = "running"
                creepMemory.__fetchTarget = undefined
            }
        }
    }
}

export default EnergyCreepProcess;
