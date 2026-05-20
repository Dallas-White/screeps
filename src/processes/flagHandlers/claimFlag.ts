import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";
import { moveToRoom } from "utils/creepUtils";


interface ClaimProcessMemory {
    room: string
}

export default class ClaimProcess extends CreepProcess<ClaimProcessMemory, {}>  {

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, flag: Flag) {
        super(kernel, parent, spawnManager, { room: flag.pos.roomName })
    }
    getSpawningPriority(): number {
        return 0
    }
    runCreep(c: Creep): void {
        if (this.memory.room in Game.rooms && Game.rooms[this.memory.room].controller?.my) {
            this.shutdown()
            return
        }
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room);
        } else {
            let claimResult = c.claimController(c.room.controller!)
            if (claimResult == OK) {
                this.shutdown()
            } else if (claimResult == ERR_NOT_IN_RANGE) {
                c.moveTo(c.room.controller!)
            } else if (claimResult == ERR_INVALID_TARGET || claimResult == ERR_GCL_NOT_ENOUGH) {
                this.shutdown()
            }
        }
    }
    onCreepDeath(): void { }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        if (this.memory.room in Game.rooms && Game.rooms[this.memory.room].controller?.my) {
            this.shutdown()
        }
        return [[MOVE, CLAIM], 1, [], 1]
    }
    getType(): string {
        return "ClaimProcess"
    }

    initCreepMemory(): {} {
        return {}
    }

}

ProcessRegistry.register("ClaimProcess", ClaimProcess)
