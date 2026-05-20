import Kernel from "Kernel";
import { object } from "lodash";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";
import { moveToRoom } from "utils/creepUtils";

interface AttackCreepProcessMemory {
    scale: number,
    ratio: BodyPartConstant[],
    object: Id<AnyCreep> | Id<Structure> | undefined
    room: string
}
export default class AttackCreepProcess extends CreepProcess<AttackCreepProcessMemory> {


    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, scale: number, ratio: BodyPartConstant[], room: string, object: AnyCreep | Structure | undefined) {
        super(kernel, parent, spawnManager, { room: room, scale: scale, ratio: ratio, object: object?.id })
    }
    setScale(scale: number) {
        this.memory.scale = scale
        this.checkSpawning()
    }

    getScale(): number {
        return this.memory.scale
    }

    initCreepMemory(): {} {
        return {}
    }
    setRatio(ratio: BodyPartConstant[]) {
        this.memory.ratio = ratio
    }

    getSpawningPriority(): number {
        return 10000
    }
    runCreep(c: Creep): void {
        if (this.memory.room && c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        let target = this.memory.object ? Game.getObjectById(this.memory.object) as AnyCreep | Structure | null : undefined
        if (!target || target == null) {
            if (this.memory.object) {
                this.memory.object = undefined
            }
            target = c.pos.findClosestByPath(FIND_HOSTILE_CREEPS)
            if (!target) target = c.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES)
        }
        if (!target) return
        if (c.attack(target as AnyCreep | Structure) == ERR_NOT_IN_RANGE) {
            c.moveTo(target)
        }
    }

    onCreepDeath(): void { }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [this.memory.ratio, this.memory.scale, [], undefined]
    }
    getType(): string {
        return "AttackCreep"
    }

}

ProcessRegistry.register("AttackCreep", AttackCreepProcess)
