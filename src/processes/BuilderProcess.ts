import { ProcessRegistry } from "Process";
import CreepProcess from "./CreepProcess";
import Kernel from "Kernel";
import EnergyCreepProcess, { actResult } from "./EnergyCreepProcess";
import { Position } from "source-map";
import { max } from "lodash";

const CONSTRUCTION_SITE_PRIORITES: Array<StructureConstant> = [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_WALL, STRUCTURE_RAMPART]
export default class BuilderProcess extends EnergyCreepProcess {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, CARRY], this.memory.scale, [], undefined]
    }

    killOnNoTarget(): boolean {
        return true
    }
    selectTarget(pos: RoomPosition): _HasId | null {
        let constructionSite = Game.rooms[pos.roomName].find(FIND_CONSTRUCTION_SITES);
        for (let structureType of CONSTRUCTION_SITE_PRIORITES) {
            let targetSites = _.filter(constructionSite, (site: ConstructionSite) => site.structureType == structureType)
            if (targetSites.length > 0) {
                constructionSite = targetSites;
                break
            }
        }

        if (constructionSite.length == 0) return null;
        return pos.findClosestByRange(constructionSite)!
    }
    getSpawningPriority(): number {
        return 1
    }

    setScale(n: number) {
        this.memory.scale = n
        this.checkSpawning();
    }


    constructor(kernel: Kernel, parent: number, spawnManager: number, roomName: string) {
        super(kernel, parent, spawnManager, roomName)
        this.memory.scale = 5
    }
    act(creep: Creep, target: ConstructionSite): actResult {
        if (creep.build(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target)
            return actResult.CONTINUE;
        } else if (creep.build(target) != OK) {
            return actResult.SELECTNEW;
        }
        return actResult.CONTINUE
    }
    getType(): string {
        return "BuilderProcess"
    }

}

ProcessRegistry.register("BuilderProcess", BuilderProcess)
