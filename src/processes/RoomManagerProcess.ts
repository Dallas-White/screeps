import Process, { ProcessRegistry } from "../Process"
import Kernel from "Kernel";
import { RoomBootstrapProcess } from "./RoomBootsrapProcess";
import HarvesterProcess from "./HarvesterProcess";
import UpgradeProcess from "./UpgradeProcess";
import BuilderProcess from "./BuilderProcess";
import RepairerProcess from "./RepairerProcess";
import CarrierProcess from "./CarrierProcess";
import WallBuilderProcess from "./WallBuilderProcess";
import { EnergyProducer, EnergyConsumer } from "utils/EnergyBalance";
import { random } from "lodash";
import init from "init";
import TowerProcess from "./TowerProcess";
import AttackCreepProcess from "./combat/AttackCreepProcess";
import HealingProcess from "./combat/HealingProcess";
import MineralHarvester from "./mineralManagement/MineralHarvester";
import MineralHauler from "./mineralManagement/MineralHauler";
import LinkManager from "./LinkManager";
import floodFill from "utils/floodfill";

const SPAWN_EMA_ALPHA=0.05
class RoomManagerProcess extends Process implements SpawnManager {
    constructor(r: Room, kernel: Kernel, parent: number) {
        super(kernel, parent)
        this.memory.room = r.name;
        this.memory.spawnQueue = []
        this.memory.spawnTick = Game.time
    }
    getMaxEnergy(from_init=false): number {
        if (Game.rooms[this.memory.room].energyCapacityAvailable == 0 && !from_init) {
            return (this.kernel.getProcess(this.getParent()) as init).getMaxEnergy()
        } else {
            return Game.rooms[this.memory.room].energyCapacityAvailable
        }
    }

    getRoomName(): string {
        return this.memory.room
    }

    cancelSpawn(pid: number, cancelGlobal: boolean = true): void {
        this.memory.spawnQueue = this.memory.spawnQueue.filter((x: any) => x.pid != pid)
        if (cancelGlobal) {
            return (this.kernel.getProcess(this.getParent()) as init).cancelSpawn(pid)
        }
    }

    park(c: Creep): boolean {
        var pos = c.pos
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (pos.x + dx < 50 && pos.x + dx >= 0 && pos.y + dy < 50 && pos.y + dy >= 0 && this.memory.parkingMatrix[pos.x + dx + (pos.y + dy)*50] > this.memory.parkingMatrix[pos.x + pos.y * 50]) {
                    c.moveTo(pos.x + dx, pos.y + dy);
                    return true;
                }
            }
        }
        return false;
    }

    addToQueue(body: BodyPartConstant[], priority: number, spawnCallback: SpawnCallback, callbackValues: any): boolean {
        if (Game.rooms[this.memory.room].energyCapacityAvailable == 0) {
            return (this.kernel.getProcess(this.getParent()) as init).addToQueue(body, priority, spawnCallback, callbackValues)
        }
        this.memory.spawnQueue.push({ body: body, priority: priority, pid: spawnCallback.getPID(), callbackValues: callbackValues })
        this.memory.spawnQueue.sort((a: any, b: any) => (a.priority > b.priority ? -1 : 1))
        return true
    }

    run(): void {
        if (!Game.rooms[this.memory.room] || !Game.rooms[this.memory.room].controller?.my) {
            this.kernel.killProcess(this.getPID())
            return
        }

        if (!this.memory.bootstrapped) {
            let bootstrapProcess = new RoomBootstrapProcess(this.kernel, this.getPID(), this.memory.room)
            this.kernel.addProcess(bootstrapProcess)
            let sources = Game.rooms[this.memory.room].find(FIND_SOURCES)

            let upgradeProcess = new UpgradeProcess(this.kernel, this.getPID(), Game.rooms[this.memory.room].controller!.id)
            this.kernel.addProcess(upgradeProcess)
            this.memory.upgradeProcess = upgradeProcess.getPID()
            for (let x of sources) {
                let harvestProcess = new HarvesterProcess(this.kernel, this.getPID(), this.getPID(), x);
                this.kernel.addProcess(harvestProcess)
            }
            let carrierProcess = new CarrierProcess(this.kernel, this.getPID());
            this.kernel.addProcess(carrierProcess)
            let carrierProcess2 = new CarrierProcess(this.kernel, this.getPID());
            carrierProcess2.sleep(Math.floor(CREEP_LIFE_TIME / 2))
            this.kernel.addProcess(carrierProcess2)
            this.memory.carrierProcesses = [carrierProcess.getPID(), carrierProcess2.getPID()]
            this.memory.bootstrapped = true
        }
        if (this.memory.spawnQueue.length > 0) {
            if (!this.kernel.getProcess(this.memory.spawnQueue[0].pid) || this.memory.spawnQueue[0].body.length == 0 ||  RoomManagerProcess.calculateBodyCost(this.memory.spawnQueue[0].body) > Game.rooms[this.memory.room].energyCapacityAvailable) {
                this.memory.spawnQueue.splice(0,1)
            }  else if (RoomManagerProcess.calculateBodyCost(this.memory.spawnQueue[0].body) <= Game.rooms[this.memory.room].energyAvailable) {
                let freeSpawns = Game.rooms[this.memory.room].find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
                if (freeSpawns.length > 0) {
                    let creepName = this.kernel.getProcess(this.memory.spawnQueue[0].pid)?.getType() + "/" + this.memory.spawnQueue[0].pid + "/" + _.random(0, 1000000);
                    let spawnReturnCode = freeSpawns[0].spawnCreep(this.memory.spawnQueue[0].body, creepName);
                    if (spawnReturnCode != 0) {
                        console.log("WARNING: " + spawnReturnCode + " returned when executing request for room " + this.memory.room)
                    } else {
                        (this.kernel.getProcess(this.memory.spawnQueue[0].pid) as unknown as SpawnCallback).onCreepSpawned(creepName, this.memory.spawnQueue[0].callbackValues);
                        this.memory.spawnQueue.splice(0, 1)
                    }
                }
            }
        }
        if (!this.memory.spawnEMA) {
            this.memory.spawnEMA = {}
            this.memory.spawnEMA.ema = this.memory.spawnQueue.length
            this.memory.spawnEMA.time = Game.time
        } else {
            this.memory.spawnEMA.ema = this.memory.spawnEMA.ema * (1-SPAWN_EMA_ALPHA) + this.memory.spawnQueue.length * SPAWN_EMA_ALPHA
        }
        let spawnMetricsTime = Game.time - this.memory.spawnEMA.time
        let averageSpawnQueueSize = this.memory.spawnEMA.ema;
        if (spawnMetricsTime > 2000 && spawnMetricsTime % 500 == 0) {
            if (averageSpawnQueueSize > 0.1) {
                for (let x of this.memory.carrierProcesses) {
                    let carrierProcess = (this.kernel.getProcess(x) as CarrierProcess)
                    carrierProcess.setScale(Math.min(carrierProcess.getAliveScale() + 1,10))
                }
            } else if (averageSpawnQueueSize < 0.05) {
                for (let x of this.memory.carrierProcesses) {
                    let carrierProcess = (this.kernel.getProcess(x) as CarrierProcess)
                    carrierProcess.setScale(Math.max(carrierProcess.getAliveScale() - 1,3))
                }
            }
        }

        if (Game.time % 5 == 0) {
            let sites = Game.rooms[this.memory.room].find(FIND_CONSTRUCTION_SITES)
            if (sites.length > 0 && (!this.memory.constructionProcess || !this.kernel.getProcess(this.memory.constructionProcess))) {
                let constructionProcess = new BuilderProcess(this.kernel, this.getPID(), this.getParent(),this.memory.mineRoom)
                this.kernel.addProcess(constructionProcess)
                this.memory.constructionProcess =  constructionProcess.getPID()
            } else if (sites.length == 0) {
                this.memory.constructionProcess = undefined
            }
            if (!this.memory.repairerProcess) {
                let decayedStructures = Game.rooms[this.memory.room].find(FIND_STRUCTURES, { filter: (x: Structure) => x.hits < x.hitsMax })
                if (decayedStructures.length > 0) {
                    let repairProc = new RepairerProcess(this.kernel, this.getPID(), this.getPID(), this.memory.room)
                    this.kernel.addProcess(repairProc)
                    this.memory.repairerProcess = repairProc.getPID()
                }
            }

            let towers = Game.rooms[this.memory.room].find(FIND_MY_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_TOWER })
            if (!this.memory.towers) this.memory.towers = {}
            for (let tower of towers) {
                if (tower.id in this.memory.towers) continue
                let towerProcess = new TowerProcess(this.kernel, this.getPID(), tower as StructureTower)
                this.kernel.addProcess(towerProcess)
                this.memory.towers[tower.id] = towerProcess
            }
        }
        if (!this.memory.wallBuilderProcess || !this.kernel.getProcess(this.memory.wallBuilderProcess)) {
            let decayedWalls = Game.rooms[this.memory.room].find(FIND_STRUCTURES, { filter: (x: Structure) => x.hits < x.hitsMax && (x.structureType == STRUCTURE_WALL || x.structureType == STRUCTURE_RAMPART) })
            if (decayedWalls.length > 0) {
                let wallBuilderProc = new WallBuilderProcess(this.kernel, this.getPID(), this.getPID())
                this.kernel.addProcess(wallBuilderProc)
                this.memory.wallBuilderProcess = wallBuilderProc.getPID()
            }
        }
        let energySum = 0;
        if (Game.time % 100 == 0) {
            if (!this.memory.linkProcess && Game.rooms[this.memory.room].find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_LINK })) {
                let linkProcess = new LinkManager(this.kernel, this.getPID(), this.memory.room)
                this.kernel.addProcess(linkProcess)
                this.memory.linkProcess = linkProcess.getPID()
            }
        }
        if (Game.time % 2000 == 0 && (Game.time - this.memory.spawnTick) >= 1500) {
            for (let x of this.getChildren()) {
                if (!this.kernel.getProcess(x)) {
                    continue
                }
                if ("getAverageEnergyProduction" in this.kernel.getProcess(x)!) {
                    energySum += (this.kernel.getProcess(x)! as unknown as EnergyProducer).getAverageEnergyProduction();
                    console.log("PID: " + x + " produced: " + (this.kernel.getProcess(x)! as unknown as EnergyProducer).getAverageEnergyProduction())
                }
                if ("getAverageEnergyConsumption" in this.kernel.getProcess(x)!) {
                    energySum -= (this.kernel.getProcess(x)! as unknown as EnergyConsumer).getAverageEnergyConsumption();
                    console.log("PID: " + x + " consumed: " + (this.kernel.getProcess(x)! as unknown as EnergyConsumer).getAverageEnergyConsumption())
                }
            }

            console.log("Average Energy Flow: " + energySum)
            if (energySum > 10 || energySum < 1) {
                let wallBuilder = (this.kernel.getProcess(this.memory.wallBuilderProcess) as WallBuilderProcess)
                let upgrader = (this.kernel.getProcess(this.memory.upgradeProcess) as UpgradeProcess)
                let construction = this.kernel.getProcess(this.memory.constructionProcess) as BuilderProcess
                let targetEnergyConsumption = energySum
                targetEnergyConsumption += upgrader.getAverageEnergyConsumption()
                if (wallBuilder) targetEnergyConsumption += wallBuilder.getAverageEnergyConsumption()
                if (construction) targetEnergyConsumption += construction.getAverageEnergyConsumption()

                if (wallBuilder || construction) targetEnergyConsumption = energySum / 2
                if (wallBuilder && construction) targetEnergyConsumption = energySum / 3
                let upgraderUsagePerPart = upgrader.getAverageEnergyConsumption() / upgrader.getAliveScale()
                let upgraderDesiredScale = Math.floor(targetEnergyConsumption/ upgraderUsagePerPart);
                upgrader.setScale(Math.min(Math.max(upgraderDesiredScale,3),40))
                if(wallBuilder) {
                    let wallBuilderUsagePerPart = wallBuilder.getAverageEnergyConsumption() / wallBuilder.getAliveScale()
                    let wallBuilderScale = Math.floor(targetEnergyConsumption/ wallBuilderUsagePerPart);
                    wallBuilder.setScale(Math.min(Math.max(wallBuilderScale, 3),40))
                }
                if(construction) {
                    let constructionUsagePerPart = construction.getAverageEnergyConsumption() / construction.getAliveScale()
                    let constructionScale = Math.floor(targetEnergyConsumption/ constructionUsagePerPart);
                    construction.setScale(Math.min(Math.max(constructionScale,3),40))
                }
            }
        }
        if (Game.rooms[this.memory.room].find(FIND_MY_CREEPS).length == 0 && (!this.memory.bootstrapProcess || !this.kernel.getProcess(this.memory.bootstrapProcess)) && Game.rooms[this.memory.room].controller!.level > 1) {
            let bootstrapProcess = new RoomBootstrapProcess(this.kernel, this.getPID(), this.memory.room)
            this.kernel.addProcess(bootstrapProcess)
            this.memory.bootstrapProcess = bootstrapProcess.getPID()
        }
        if (Game.rooms[this.memory.room].find(FIND_HOSTILE_CREEPS).length > 0) {
            let hostileAttackParts = _.sum(Game.rooms[this.memory.room].find(FIND_HOSTILE_CREEPS).map((c) => _.sum(_.filter(c.body, (c) => c.type == ATTACK || c.type == HEAL || c.type == RANGED_ATTACK))))
            if (!this.memory.defender) {
                let defenseProcess = new AttackCreepProcess(this.kernel, this.getPID(), this.getPID(), Math.max(hostileAttackParts*2, 6), [TOUGH, ATTACK, MOVE], this.memory.room, undefined)
                this.memory.defender = defenseProcess.getPID()
                this.kernel.addProcess(defenseProcess)
                let healingProcess = new HealingProcess(this.kernel, this.getPID(), this.getPID(), Math.max(hostileAttackParts*2, 6), [TOUGH, HEAL, MOVE], this.memory.room, undefined)
                this.memory.healer = healingProcess.getPID()
                this.kernel.addProcess(healingProcess)
            }
            let defenseProcess = this.kernel.getProcess(this.memory.defender)! as AttackCreepProcess
            if (defenseProcess.getScale() < hostileAttackParts*3) {
                defenseProcess.setScale(hostileAttackParts*3)
            }
        } else if (this.memory.defender) {
            this.kernel.getProcess(this.memory.defender)?.shutdown()
            this.memory.defender = undefined
            this.kernel.getProcess(this.memory.healer)?.shutdown()
            this.memory.healer = undefined
        }
        if (Game.rooms[this.memory.room].controller!.level > 5 && !this.memory.mineralHauler) {
            let mineral = Game.rooms[this.memory.room].find(FIND_MINERALS)[0]
            let container = mineral.pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })[0] as StructureContainer
            if (container) {
                let resourceType = mineral.mineralType
                let mineralHaulerProc = new MineralHauler(this.kernel,this.getPID(),this.memory.room,container,resourceType)
                this.memory.mineralHauler = mineralHaulerProc.getPID()
                this.kernel.addProcess(mineralHaulerProc)
            }
        }

        if (Game.rooms[this.memory.room].controller!.level > 5 && !this.memory.mineralHarvester) {
            if (Game.rooms[this.memory.room].find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_EXTRACTOR }).length > 0) {
                let mineralProc = new MineralHarvester(this.kernel, this.getPID(), Game.rooms[this.memory.room].find(FIND_MINERALS)[0])
                this.memory.mineralHarvester = mineralProc.getPID()
                this.kernel.addProcess(mineralProc)
            }
        }
        if (Game.time % 1000 == 0 || !this.memory.parkingMatrix) {
            let structures = Game.rooms[this.memory.room].find(FIND_STRUCTURES).map(s => s.pos);
            let sources = Game.rooms[this.memory.room].find(FIND_SOURCES).map(s => s.pos);
            let exits = Game.rooms[this.memory.room].find(FIND_EXIT);
            this.memory.parkingMatrix = floodFill([...structures,...sources,...exits], this.memory.room)
        }
    }

    static calculateBodyCost(body: BodyPartConstant[]): number {
        return _.sum(_.map(body, (x) => BODYPART_COST[x]));
    }

    getType(): string {
        return "RoomManager"
    }

}

ProcessRegistry.register("RoomManager", RoomManagerProcess);

export default RoomManagerProcess;

