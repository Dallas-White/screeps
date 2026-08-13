import { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import { Position } from "source-map";
import RoomManagerProcess from "./RoomManagerProcess";

interface UpgradeProcessMemory {
    scale: number,
    controller_id: Id<StructureController>
}

export default class UpgradeProcess extends EnergyCreepProcess<UpgradeProcessMemory> {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined];
    }

    killOnNoTarget(): boolean {
        return false
    }

    constructor(kernel: Kernel, parent: RoomManagerProcess, controller_id: Id<StructureController>) {
        super(kernel, parent, parent, parent.getRoomName(), { controller_id: controller_id, scale: 3 })
    }

    getScale(): number {
        return this.memory.scale
    }

    setScale(n: number) {
        this.memory.scale = n
        this.memory.__spawningRatio = 0
        this.kernel.getProcess(this.memory.spawnManager)?.cancelSpawn(this.getPID())
        this.checkSpawning()
    }

    act(creep: Creep): actResult {
        let upgradeResult = creep.upgradeController(Game.getObjectById(this.memory.controller_id) as StructureController)
        if (upgradeResult == ERR_NOT_IN_RANGE) {
            creep.moveTo(Game.getObjectById(this.memory.controller_id) as StructureController)
        }
        return actResult.CONTINUE
    }
    selectTarget(p: RoomPosition): _HasId {
        return Game.getObjectById(this.memory.controller_id)!;
    }
    getSpawningPriority(): number {
        return 1;
    }
    onCreepDeath(): void { }

    getType(): string {
        return "UpgradeProcess";
    }

}

ProcessRegistry.register("UpgradeProcess", UpgradeProcess)
