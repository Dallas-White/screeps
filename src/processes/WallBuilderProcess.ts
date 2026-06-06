import Process, { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import RoomManagerProcess from "./RoomManagerProcess";

export default class WallBuilderProcess extends EnergyCreepProcess<{ scale: number }> {
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }
    constructor(kernel: Kernel, parent: Process, roomManager: RoomManagerProcess) {
        super(kernel, parent, roomManager, roomManager.getRoomName(), { scale: 3 })
    }

    act(creep: Creep, target: _HasId): actResult {
        if ((target as Structure).hits == (target as Structure).hitsMax) return actResult.SELECTNEW
        let repairCode = creep.repair(target as Structure)
        if (repairCode == ERR_NOT_IN_RANGE) {
            creep.moveTo(target as Structure)
            return actResult.CONTINUE
        } else if (repairCode != OK) {
            return actResult.SELECTNEW
        }
        //TODO: check if this can be replaced with a capacity check to check for a new one when the creep runs out of energy
        if (Game.time % 10 == 0 || creep.room.controller!.level < 3) return actResult.SELECTNEW
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
            return (((Math.log10(a.hits) - Math.log10(b.hits)) * (50 / Math.log10(WALL_HITS_MAX))) / 50) * 0.5 + ((pos.getRangeTo(a) - pos.getRangeTo(b)) / 50) * 0.5;
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
