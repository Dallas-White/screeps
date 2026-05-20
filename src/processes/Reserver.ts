import { moveToRoom } from "utils/creepUtils";
import CreepProcess from "./CreepProcess";
import Process, { ProcessRegistry } from "Process";
import Kernel from "Kernel";
import { SpawnManager } from "SpawnManager";

export default class Reserver extends CreepProcess<{ room: string }> {
    initCreepMemory(): {} {
        return {}
    }

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, room: string) {
        super(kernel, parent, spawnManager, { room: room })
        this.memory.room = room
    }

    getSpawningPriority(): number {
        return 0
    }
    runCreep(c: Creep): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        if (c.reserveController(c.room.controller!)) {
            c.moveTo(c.room.controller!)
        }
    }
    onCreepDeath(): void { }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, CLAIM], 2, [], undefined]
    }

    getType(): string {
        return "Reserver"
    }

}

ProcessRegistry.register("Reserver", Reserver)
