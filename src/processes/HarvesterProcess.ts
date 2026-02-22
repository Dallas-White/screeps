import Kernel from "Kernel"
import { ProcessRegistry } from "../Process"
import CreepProcess from "./CreepProcess"
import { EnergyProducer } from "utils/EnergyBalance";
import { moveToRoom } from "utils/creepUtils";
import { forEachRight } from "lodash";

const ENERGY_MINING_ALPHA = 0.01
export default class HarvesterProcess extends CreepProcess implements EnergyProducer {

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        if (Game.getObjectById(this.memory.source) && !this.memory.freeSpaces) {
            let sourcePos = (Game.getObjectById(this.memory.source) as Source).pos;
            let terrain = (Game.getObjectById(this.memory.source) as Source).room.getTerrain()
            let freeSpaces = 0
            for (var x = sourcePos.x - 1; x <= sourcePos.x + 1; x++) {
                if (x >= 50 || x == sourcePos.x || x < 0) continue;
                for (var y = sourcePos.y - 1; y <= sourcePos.y + 1; y++) {
                    if (y >= 50 || y == sourcePos.y || y < 0) continue;
                    if (terrain.get(x, y) != TERRAIN_MASK_WALL) freeSpaces++
                }
            }
            this.memory.freeSpaces = freeSpaces
        }
        if (Game.getObjectById(this.memory.source) && (Game.getObjectById(this.memory.source)! as Source).room.energyCapacityAvailable == 0) return [[WORK, MOVE], 6, [], this.memory.freeSpaces]
        if (this.memory.link) return [[WORK], 6, [MOVE, CARRY], this.memory.freeSpaces]
        return [[WORK], 6, [MOVE], this.memory.freeSpaces]
    }

    getSpawningPriority(): number {
        return 200
    }
    constructor(kernel: Kernel, parent: number, spawnManager: number, source: Source) {
        super(kernel, parent, spawnManager);
        this.memory.source = source.id
        this.findAdjacentContainers()
        this.resetEnergyProduction()
    }

    resetEnergyProduction(): void {
        this.memory.miningTimer = Game.time;
        this.memory.minedEnergy = 0
    }

    getEnergyProduced(): number {
        return this.memory.minedEnergy
    }

    getProductionTimer(): number {
        return Game.time - this.memory.miningTimer
    }

    getAverageEnergyProduction(): number {
        return this.memory.minedEnergy
    }

    runCreep(c: Creep): void {
        let src = Game.getObjectById(this.memory.source) as Source;
        let mineResult = c.harvest(src);
        if ((!this.memory.container || !this.memory.link) && Game.time % 1000 == 0) {
            this.findAdjacentContainers()
        }
        if (src.room.name != c.room.name) {
            moveToRoom(c, src.room.name)
            return
        }
        if (this.memory.container && c.pos != new RoomPosition(this.memory.container.x, this.memory.container.y, this.memory.container.roomName) && c.room.lookForAt(LOOK_CREEPS, this.memory.container.x, this.memory.container.y).length == 0) {
            c.moveTo(new RoomPosition(this.memory.container.x, this.memory.container.y, this.memory.container.roomName))
            this.memory.minedEnergy *= (1 - ENERGY_MINING_ALPHA)
            return
        } else if (mineResult == ERR_NOT_IN_RANGE) {
            c.moveTo(src)
        }
        if (mineResult == OK) {
            if (this.memory.link) c.transfer(Game.getObjectById(this.memory.link) as StructureLink, RESOURCE_ENERGY)
            this.memory.minedEnergy = this.memory.minedEnergy * (1 - ENERGY_MINING_ALPHA) + (HARVEST_POWER * c.body.filter((p) => p.type == WORK).length) * ENERGY_MINING_ALPHA
        } else {
            this.memory.minedEnergy *= (1 - ENERGY_MINING_ALPHA)
        }
    }

    findAdjacentContainers() {
        let container = (Game.getObjectById(this.memory.source) as Source).pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })
        if (container.length != 0) {
            this.memory.container = container[0].pos
            this.checkSpawning()
        } else {
            this.memory.container = undefined
        }
        let link = (Game.getObjectById(this.memory.source) as Source).pos.findInRange(FIND_STRUCTURES, 2, { filter: (x) => x.structureType == STRUCTURE_LINK })
        if (link.length != 0) {
            this.memory.link = link[0].id
            this.checkSpawning()
        } else {
            this.memory.link = undefined
        }
    }
    onCreepDeath(): void { }


    getType(): string {
        return "HarvesterProcess"
    }

}

ProcessRegistry.register("HarvesterProcess", HarvesterProcess)
