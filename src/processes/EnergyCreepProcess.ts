import Process, { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import { Position } from "source-map";
import { EnergyConsumer } from "../utils/EnergyBalance"
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";
import { gatherEnergy, moveToRoom } from "utils/creepUtils";
import { SpawnManager } from "SpawnManager";


enum ECState {
    FETCHING = 0,
    ACTING = 1
}


interface EnergyCreepProcessMemory {
    room: string
}

interface EnergyCreepMemory {
    __roomTraveledTo: boolean
    __ecTarget: Id<_HasId> | undefined,
    __ecState: ECState,
    __fetchTarget: Id<_HasId> | undefined
}

export enum actResult {
    CONTINUE,
    SELECTNEW
}

const TICKS_TO_LIVE_MIN = 100

abstract class EnergyCreepProcess<P> extends CreepProcess<P & EnergyCreepProcessMemory, EnergyCreepMemory> {

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, roomName: string, memory: P) {
        super(kernel, parent, spawnManager, { room: roomName, ...memory })
        this.memory.room = roomName
    }

    initCreepMemory(): EnergyCreepMemory {
        return {
            __roomTraveledTo: false,
            __ecTarget: undefined,
            __ecState: ECState.FETCHING,
            __fetchTarget: undefined
        }
    }
    abstract act(creep: Creep, target: _HasId): actResult

    onCreepDeath(): void {
    }

    abstract killOnNoTarget(): boolean;


    abstract selectTarget(pos: RoomPosition): _HasId | null


    runCreep(creep: Creep, creepMemory: EnergyCreepMemory): void {
        if (!this.memory.room) this.memory.room = (this.getParent() as RoomManagerProcess).getRoomName()
        if (creep.room.name != this.memory.room && !creepMemory.__roomTraveledTo) {
            moveToRoom(creep, this.memory.room)
            return
        } else {
            creepMemory.__roomTraveledTo = true
        }
        if (creepMemory.__ecState == ECState.ACTING) {
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
            let result = this.act(creep, Game.getObjectById(creepMemory.__ecTarget)!)
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
                creepMemory.__ecState = ECState.FETCHING
                creepMemory.__ecTarget = undefined
            }
        } else {
            if (creep.ticksToLive! <= TICKS_TO_LIVE_MIN) {
                creep.suicide()
                return
            }
            this.logEnergyConsumption(gatherEnergy(creep, creepMemory))
            if (creep.store.getFreeCapacity() == 0) {
                creepMemory.__ecState = ECState.ACTING
                creepMemory.__fetchTarget = undefined
            }
        }
    }
}

export default EnergyCreepProcess;
