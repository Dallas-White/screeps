import Kernel from "Kernel"
import Process, { ProcessRegistry } from "Process"
import CreepProcess from "processes/CreepProcess"
import FlagHandlerRegistry, { FlagHandler } from "processes/flagHandlers/flagHandler"
import { SpawnManager } from "SpawnManager"
import { moveToRoom } from "utils/creepUtils"

type ControllerAttackerMemory = {
    targetRoom: string
}

export default class ControllerAttacker extends CreepProcess<ControllerAttackerMemory, {}> {

    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, target: string) {
        super(kernel, parent, spawnManager, { targetRoom: target })
    }
    initCreepMemory(): {} { return {} }
    getSpawningPriority(): number {
        return 100
    }
    runCreep(c: Creep, creepMemory: ControllerAttackerMemory): void {
        if (c.room.name != this.memory.targetRoom) {
            moveToRoom(c, this.memory.targetRoom);
            return
        }
        let attackCode = c.attackController(c.room.controller!)
        if (attackCode == ERR_NOT_IN_RANGE) {
            c.moveTo(c.room.controller!)
        } else if (attackCode == ERR_TIRED) {
            this.sleep((c.room.controller?.upgradeBlocked || 201) - 200);
        } else if (attackCode == ERR_INVALID_TARGET) {
            this.shutdown() //this menas that this controller is not claimed and this process is not needed
        }
    }
    onCreepDeath(): void { }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: BodyPartConstant[] | undefined, maxCreeps: number | undefined] {
        return [[CLAIM], 50, [MOVE], 1]
    }


    getType(): string {
        return "ControllerAttacker"
    }

}


ProcessRegistry.register("ControllerAttacker", ControllerAttacker)

FlagHandlerRegistry.register("AttackController", (kernel: Kernel, parent: Process, sp: SpawnManager, f: Flag) => {
    return new ControllerAttacker(kernel, parent, sp, f.pos.roomName)
})