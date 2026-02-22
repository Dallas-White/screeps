import { ProcessRegistry } from "Process";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import { Position } from "source-map";
import RoomManagerProcess from "./RoomManagerProcess";

export default class UpgradeProcess extends EnergyCreepProcess {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined];
    }

    killOnNoTarget(): boolean {
        return false
    }

    constructor(kernel: Kernel, parent: number, controller_id: string) {
        super(kernel, parent, parent, (kernel.getProcess(parent) as RoomManagerProcess).getRoomName())
        this.memory.controller_id = controller_id
        this.memory.scale = 3
    }

    getScale(): number {
        return this.memory.scale
    }

    setScale(n: number) {
        this.checkSpawning()
        this.memory.scale = n
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
