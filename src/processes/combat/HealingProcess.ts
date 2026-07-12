import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";
import { moveToRoom } from "utils/creepUtils";


interface HealingProcessMemory {
    scale: number,
    ratio: BodyPartConstant[],
    object: Id<AnyCreep> | Id<Structure> | undefined
    room: string
}

export default class HealingProcess extends CreepProcess<HealingProcessMemory> {


    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, scale: number, ratio: BodyPartConstant[], room: string, object: AnyCreep | Structure | undefined) {
        super(kernel, parent, spawnManager, {
            room: room,
            scale: scale,
            ratio: ratio,
            object: object?.id
        })
    }

    setScale(n: number) {
        this.memory.scale = n
        this.checkSpawning()
    }

    initCreepMemory(): {} {
        return {}
    }

    getSpawningPriority(): number {
        return 10000
    }
    runCreep(c: Creep): void {
        if (c.hits < c.hitsMax) c.heal(c)
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        let target = c.pos.findClosestByPath(FIND_MY_CREEPS, { filter: (target) => target.hits < target.hitsMax })
        if (!target) target = c.pos.findClosestByPath(FIND_MY_CREEPS, { filter: (target) => target.name != c.name })
        if (!target) return;
        c.moveTo(target)
        if (target.hits < target.hitsMax) c.heal(target)
    }
    onCreepDeath(): void { }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [this.memory.ratio, this.memory.scale, [], undefined]
    }
    getType(): string {
        return "HealingProcess"
    }
}
ProcessRegistry.register("HealingProcess", HealingProcess)
