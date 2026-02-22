import { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";

export default class WallBuilderProcess extends EnergyCreepProcess {
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }
    constructor(kernel: Kernel, parent: number, roomManager: number) {
        super(kernel, parent, roomManager, (kernel.getProcess(parent) as RoomManagerProcess).getRoomName())
        this.memory.scale = 3
    }

    act(creep: Creep, target: _HasId): actResult {
        if (creep.repair(target as Structure) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target as Structure)
            return actResult.CONTINUE
        }
        if (Game.time % 20 == 0) return actResult.SELECTNEW
        return actResult.CONTINUE;
    }
    getScale(): number {
        return this.memory.scale
    }

    setScale(n: number) {
        this.memory.scale = n
        this.checkSpawning();
    }
    killOnNoTarget(): boolean {
        return false
    }

    selectTarget(pos: RoomPosition): _HasId | null {
        let damagedDefenses = Game.rooms[pos.roomName].find(FIND_STRUCTURES, { filter: (struct) => (struct.structureType == STRUCTURE_WALL || struct.structureType == STRUCTURE_RAMPART) && struct.hits < struct.hitsMax })
        if (damagedDefenses.length == 0) return null;
        damagedDefenses.sort((a: AnyStructure, b: AnyStructure): number => {
            return (a.hits - b.hits) * 0.01 + (pos.getRangeTo(a) - pos.getRangeTo(b)) * 0.99;
        })
        return damagedDefenses[0];
    }

    getSpawningPriority(): number {
        return 0;
    }

    getType(): string {
        return "WallBuilderProcess"
    }

}

ProcessRegistry.register("WallBuilderProcess", WallBuilderProcess)
