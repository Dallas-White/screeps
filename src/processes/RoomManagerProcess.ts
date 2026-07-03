import Process, { ProcessRegistry } from "../Process"
import Kernel from "Kernel";
import { RoomBootstrapProcess } from "./RoomBootsrapProcess";
import HarvesterProcess from "./HarvesterProcess";
import UpgradeProcess from "./UpgradeProcess";
import BuilderProcess, { ConstructionFinishedCallback } from "./BuilderProcess";
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
import LinkManager from "./LinkManager";
import floodFill from "utils/floodfill";
import { SpawnCallback, SpawnManager } from "SpawnManager";
import { CarrierJobFinishedCallback, LogisticsManager } from "./LogisticsManager";
import { TerminalManager, TerminalTask, TerminalTaskCallback, TerminalTaskID, TerminalTaskType } from "./structureManagement/TerminalManager";

const SPAWN_EMA_ALPHA = 0.05

interface SpawnRequest<T> {
    pid: Pid<SpawnCallback<T>>
    body: BodyPartConstant[]
    priority: number
    callbackValues: T
}

interface RoomManagerMemory {
    room: string;
    spawnQueue: SpawnRequest<any>[];
    spawnTick: number;
    terminalClearTask: TerminalTaskID | undefined
    towers: Record<Id<StructureTower>, Pid<TowerProcess>>;
    wallBuilderProcess: Pid<WallBuilderProcess> | undefined;
    repairerProcess: Pid<RepairerProcess> | undefined;
    linkProcess: Pid<LinkManager> | undefined;
    mineralHarvester: Pid<MineralHarvester> | undefined;
    upgradeProcess: Pid<UpgradeProcess>;
    logisticsManager: Pid<LogisticsManager>;
    spawnEMA: {
        ema: number
        time: number
    };
    bootstrapped: boolean,
    constructionProcess: Pid<BuilderProcess> | undefined;
    bootstrapProcess: Pid<RoomBootstrapProcess> | undefined;
    defender: Pid<AttackCreepProcess> | undefined;
    healer: Pid<HealingProcess> | undefined;
    refillRequests: Record<Id<AnyStoreStructure>, LogisticsTaskID>
    needsRefillScan: boolean,
    terminalManager: Pid<TerminalManager> | undefined

}
class RoomManagerProcess extends Process<RoomManagerMemory> implements SpawnManager, ConstructionFinishedCallback, CarrierJobFinishedCallback, TerminalTaskCallback {
    constructor(r: Room, kernel: Kernel, parent: Process) {
        super(kernel, parent, {
            room: r.name,
            spawnQueue: [],
            spawnTick: Game.time,
            towers: {},
            wallBuilderProcess: undefined,
            repairerProcess: undefined,
            linkProcess: undefined,
            mineralHarvester: undefined,
            upgradeProcess: 0 as Pid<UpgradeProcess>,
            spawnEMA: { ema: 0, time: Game.time },
            logisticsManager: 0 as Pid<LogisticsManager>,
            bootstrapped: false,
            constructionProcess: undefined,
            bootstrapProcess: undefined,
            defender: undefined,
            healer: undefined,
            refillRequests: {},
            needsRefillScan: true,
            terminalClearTask: undefined,
            terminalManager: undefined
        });

    }
    onTaskDone(t: TerminalTask, id: TerminalTaskID): void {
        this.memory.terminalClearTask = undefined
    }

    onCarrierJobFinished(task: LogisticsTask): void {
        delete this.memory.refillRequests[task.dest!]
    }

    getLogisticsManager(): LogisticsManager {
        return this.kernel.getProcess(this.memory.logisticsManager)!
    }

    scanForRefills() {
        let structuresNeedingEnergy = Game.rooms[this.memory.room].find(FIND_MY_STRUCTURES, { filter: (s) => (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }) as AnyStoreStructure[]
        for (let x of structuresNeedingEnergy) {
            if (this.memory.refillRequests[x.id]) {
                try {
                    this.getLogisticsManager().resizeTask(this.memory.refillRequests[x.id], x.store.getFreeCapacity(RESOURCE_ENERGY))
                } catch {
                    delete this.memory.refillRequests[x.id]
                    this.memory.refillRequests[x.id] = this.getLogisticsManager().addLogisticTask({
                        priority: 500,
                        amount: x.store.getFreeCapacity(RESOURCE_ENERGY),
                        source: undefined,
                        dest: x.id,
                        resource: RESOURCE_ENERGY,
                        callback: this.getPID()
                    })
                }
            } else {
                this.memory.refillRequests[x.id] = this.getLogisticsManager().addLogisticTask({
                    priority: 500,
                    amount: x.store.getFreeCapacity(RESOURCE_ENERGY),
                    source: undefined,
                    dest: x.id,
                    resource: RESOURCE_ENERGY,
                    callback: this.getPID()
                })
            }
        }
    }


    onConstructionFinished(type: StructureConstant, pos: RoomPosition): void {
        let pmStructures = Game.rooms[this.memory.room].find(FIND_STRUCTURES).map(s => s.pos);
        let sources = Game.rooms[this.memory.room].find(FIND_SOURCES).map(s => s.pos);
        let exits = Game.rooms[this.memory.room].find(FIND_EXIT);
        global.parkingMaps[this.memory.room] = floodFill([...pmStructures, ...sources, ...exits], this.memory.room)

        let structures = pos.lookFor(LOOK_STRUCTURES).filter((s) => s.structureType == type)
        if (structures.length == 0) return;
        let structure = structures[0];
        if (structure.structureType == STRUCTURE_TERMINAL) {
            let terminalManager = new TerminalManager(this.kernel, this, structure)
            this.memory.terminalManager = this.kernel.addProcess(terminalManager)
        } else if (structure.structureType == STRUCTURE_TOWER) {
            if (!this.memory.towers) {
                this.memory.towers = {}
            }
            if (!this.memory.towers[structure.id]) {
                let towerProcess = new TowerProcess(this.kernel, this, structure as StructureTower)
                this.kernel.addProcess(towerProcess)
                this.memory.towers[structure.id] = towerProcess.getPID()
            }
        } else if ((structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_RAMPART) && !this.memory.wallBuilderProcess) {
            let wallBuilderProc = new WallBuilderProcess(this.kernel, this, this)
            this.kernel.addProcess(wallBuilderProc)
            this.memory.wallBuilderProcess = wallBuilderProc.getPID()
        } else if ((structure.structureType == STRUCTURE_ROAD || structure.structureType == STRUCTURE_CONTAINER) && (!this.memory.towers || Object.keys(this.memory.towers).length == 0) && !this.memory.repairerProcess) {

            let repairProc = new RepairerProcess(this.kernel, this, this, this.memory.room)
            this.kernel.addProcess(repairProc)
            this.memory.repairerProcess = repairProc.getPID()
        } else if (structure.structureType == STRUCTURE_LINK && !this.memory.linkProcess) {
            let linkProcess = new LinkManager(this.kernel, this, this.memory.room)
            this.kernel.addProcess(linkProcess)
            this.memory.linkProcess = linkProcess.getPID()
        } else if (structure.structureType == STRUCTURE_EXTRACTOR && !this.memory.mineralHarvester) {
            let mineralProc = new MineralHarvester(this.kernel, this, Game.rooms[this.memory.room].find(FIND_MINERALS)[0])
            this.memory.mineralHarvester = mineralProc.getPID()
            this.kernel.addProcess(mineralProc)
        }

    }
    getMaxEnergy(from_init = false): number {
        if (Game.rooms[this.memory.room].energyCapacityAvailable == 0 && !from_init) {
            return (this.getParent() as init).getMaxEnergy()
        } else {
            return Game.rooms[this.memory.room].energyCapacityAvailable
        }
    }

    getRoomName(): string {
        return this.memory.room
    }

    cancelSpawn(pid: number, cancelGlobal: boolean = true): void {
        this.memory.spawnQueue = this.memory.spawnQueue.filter((x: SpawnRequest<any>) => x.pid != pid)
        if (cancelGlobal) {
            return (this.getParent() as init).cancelSpawn(pid)
        }
    }

    park(c: Creep): boolean {
        var pos = c.pos
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (pos.x + dx < 50 && pos.x + dx >= 0 && pos.y + dy < 50 && pos.y + dy >= 0 && global.parkingMaps[this.memory.room][pos.x + dx + (pos.y + dy) * 50] > global.parkingMaps[this.memory.room][pos.x + pos.y * 50]) {
                    c.moveTo(pos.x + dx, pos.y + dy);
                    return true;
                }
            }
        }
        return false;
    }

    addToQueue<T>(body: BodyPartConstant[], priority: number, targetRoom: string | undefined, spawnCallback: SpawnCallback<T>, callbackValues: T): boolean {
        if (Game.rooms[this.memory.room].energyCapacityAvailable == 0) {
            return (this.getParent() as init).addToQueue(body, priority, this.memory.room, spawnCallback, callbackValues)
        }
        this.memory.spawnQueue.push({ body: body, priority: priority, pid: spawnCallback.getPID(), callbackValues: callbackValues })
        this.memory.spawnQueue.sort((a: SpawnRequest<any>, b: SpawnRequest<any>) => (a.priority > b.priority ? -1 : 1))
        return true
    }

    run(): void {
        if (!this.memory.terminalManager) {
            let terminal = Game.rooms[this.memory.room].terminal
            if (terminal) {
                this.memory.terminalManager = this.kernel.addProcess(new TerminalManager(this.kernel, this, terminal))

            }
        }
        if (!global.parkingMaps[this.memory.room]) {

            let pmStructures = Game.rooms[this.memory.room].find(FIND_STRUCTURES).map(s => s.pos);
            let sources = Game.rooms[this.memory.room].find(FIND_SOURCES).map(s => s.pos);
            let exits = Game.rooms[this.memory.room].find(FIND_EXIT);
            global.parkingMaps[this.memory.room] = floodFill([...pmStructures, ...sources, ...exits], this.memory.room)
        }
        if (this.memory.needsRefillScan) {
            this.scanForRefills()
            this.memory.needsRefillScan = false
        }
        if (!this.memory.bootstrapped) {
            let logisticsManagerProcess = new LogisticsManager(this.kernel, this, this.memory.room)
            this.memory.logisticsManager = this.kernel.addProcess(logisticsManagerProcess)
            let bootstrapProcess = new RoomBootstrapProcess(this.kernel, this, this.memory.room)
            this.kernel.addProcess(bootstrapProcess)
            let sources = Game.rooms[this.memory.room].find(FIND_SOURCES)
            let upgradeProcess = new UpgradeProcess(this.kernel, this, Game.rooms[this.memory.room].controller!.id)
            this.kernel.addProcess(upgradeProcess)
            this.memory.upgradeProcess = upgradeProcess.getPID()
            for (let x of sources) {
                let harvestProcess = new HarvesterProcess(this.kernel, this, this, x);
                this.kernel.addProcess(harvestProcess)
            }
            this.memory.bootstrapped = true
        }
        if (!Game.rooms[this.memory.room] || !Game.rooms[this.memory.room].controller?.my) {
            this.kernel.killProcess(this.getPID())
            return
        }
        if (this.memory.repairerProcess && Object.keys(this.memory.towers).length > 0) {
            let damagedStrucures = Game.rooms[this.memory.room].find(FIND_STRUCTURES, { filter: (x) => x.hits < x.hitsMax && x.structureType != STRUCTURE_WALL && x.structureType != STRUCTURE_RAMPART })
            if (damagedStrucures.length == 0) {
                this.kernel.shutdownProcess(this.memory.repairerProcess);
                delete this.memory.repairerProcess
            }
        }

        if (this.memory.spawnQueue.length > 0) {
            if (!this.kernel.getProcess(this.memory.spawnQueue[0].pid) || this.memory.spawnQueue[0].body.length == 0 || RoomManagerProcess.calculateBodyCost(this.memory.spawnQueue[0].body) > Game.rooms[this.memory.room].energyCapacityAvailable) {
                this.memory.spawnQueue.splice(0, 1)
            } else if (RoomManagerProcess.calculateBodyCost(this.memory.spawnQueue[0].body) <= Game.rooms[this.memory.room].energyAvailable) {
                let freeSpawns = Game.rooms[this.memory.room].find(FIND_MY_SPAWNS, { filter: (spawn) => !spawn.spawning });
                if (freeSpawns.length > 0) {
                    let creepName = this.kernel.getProcess(this.memory.spawnQueue[0].pid)?.getType() + "/" + this.memory.spawnQueue[0].pid + "/" + _.random(0, 1000000);
                    let spawnReturnCode = freeSpawns[0].spawnCreep(this.memory.spawnQueue[0].body, creepName);
                    if (spawnReturnCode != 0) {
                        console.log("WARNING: " + spawnReturnCode + " returned when executing request for room " + this.memory.room)
                    } else {
                        (this.kernel.getProcess(this.memory.spawnQueue[0].pid) as SpawnCallback<any>).onCreepSpawned(creepName, this.memory.spawnQueue[0].callbackValues);
                        this.memory.spawnQueue.splice(0, 1)
                        this.memory.needsRefillScan = true
                    }
                }
            }
        }

        this.memory.spawnEMA.ema = this.memory.spawnEMA.ema * (1 - SPAWN_EMA_ALPHA) + this.memory.spawnQueue.length * SPAWN_EMA_ALPHA
        if (Game.time % 5 == 0) {
            let sites = Game.rooms[this.memory.room].find(FIND_CONSTRUCTION_SITES)
            if (sites.length > 0 && (!this.memory.constructionProcess || !this.kernel.getProcess(this.memory.constructionProcess))) {
                let constructionProcess = new BuilderProcess(this.kernel, this, this, this.memory.room, this)
                this.kernel.addProcess(constructionProcess)
                this.memory.constructionProcess = constructionProcess.getPID()
            } else if (sites.length == 0) {
                this.memory.constructionProcess = undefined
            }


        }

        let energySum = 0;
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
            if (energySum > 2 || energySum < 1) {
                let wallBuilder = this.memory.wallBuilderProcess ? (this.kernel.getProcess(this.memory.wallBuilderProcess) as WallBuilderProcess) : undefined;
                let upgrader = this.kernel.getProcess(this.memory.upgradeProcess!) as UpgradeProcess;
                let construction = this.memory.constructionProcess ? this.kernel.getProcess(this.memory.constructionProcess) as BuilderProcess : undefined;
                let targetEnergyConsumption = energySum
                targetEnergyConsumption += upgrader.getAverageEnergyConsumption()
                if (wallBuilder) targetEnergyConsumption += wallBuilder.getAverageEnergyConsumption()
                if (construction) targetEnergyConsumption += construction.getAverageEnergyConsumption()

                if (wallBuilder || construction) targetEnergyConsumption = energySum / 2
                if (wallBuilder && construction) targetEnergyConsumption = energySum / 3
                let upgraderUsagePerPart = upgrader.getAverageEnergyConsumption() / upgrader.getAliveScale()
                let upgraderDesiredScale = Math.floor(targetEnergyConsumption / upgraderUsagePerPart);
                upgrader.setScale(Math.min(Math.max(upgraderDesiredScale, 3), 40))
                if (wallBuilder) {
                    let wallBuilderUsagePerPart = wallBuilder.getAverageEnergyConsumption() / wallBuilder.getAliveScale()
                    let wallBuilderScale = Math.floor(targetEnergyConsumption / wallBuilderUsagePerPart);
                    wallBuilder.setScale(Math.min(Math.max(wallBuilderScale, 3), 40))
                }
                if (construction) {
                    let constructionUsagePerPart = construction.getAverageEnergyConsumption() / construction.getAliveScale()
                    let constructionScale = Math.floor(targetEnergyConsumption / constructionUsagePerPart);
                    construction.setScale(Math.min(Math.max(constructionScale, 3), 40))
                }
            }
        }
        if (Game.time % 50 == 0 && Game.rooms[this.memory.room].find(FIND_MY_CREEPS).length == 0 && (!this.memory.bootstrapProcess || !this.kernel.getProcess(this.memory.bootstrapProcess)) && Game.rooms[this.memory.room].controller!.level > 1) {
            let bootstrapProcess = new RoomBootstrapProcess(this.kernel, this, this.memory.room)
            this.kernel.addProcess(bootstrapProcess)
            this.memory.bootstrapProcess = bootstrapProcess.getPID()
        }
        if (Game.rooms[this.memory.room].find(FIND_HOSTILE_CREEPS).length > 0) {
            let hostileAttackParts = _.sum(Game.rooms[this.memory.room].find(FIND_HOSTILE_CREEPS).map((c) => _.sum(_.filter(c.body, (c) => c.type == ATTACK || c.type == HEAL || c.type == RANGED_ATTACK))))
            if (!this.memory.defender) {
                let defenseProcess = new AttackCreepProcess(this.kernel, this, this, Math.max(hostileAttackParts * 2, 6), [TOUGH, ATTACK, MOVE], this.memory.room, undefined)
                this.memory.defender = defenseProcess.getPID()
                this.kernel.addProcess(defenseProcess)
                let healingProcess = new HealingProcess(this.kernel, this, this, Math.max(hostileAttackParts * 2, 6), [TOUGH, HEAL, MOVE], this.memory.room, undefined)
                this.memory.healer = healingProcess.getPID()
                this.kernel.addProcess(healingProcess)
            }
            let defenseProcess = this.kernel.getProcess(this.memory.defender)! as AttackCreepProcess
            if (defenseProcess.getScale() < hostileAttackParts * 3) {
                defenseProcess.setScale(hostileAttackParts * 3)
            }
        } else if (this.memory.defender) {
            this.kernel.getProcess(this.memory.defender)?.shutdown()
            this.memory.defender = undefined

            this.kernel.getProcess(this.memory.healer!)?.shutdown()
            this.memory.healer = undefined
        }

        if (this.memory.terminalManager != undefined && !this.memory.terminalClearTask && (Game.rooms[this.memory.room].storage?.store[RESOURCE_ENERGY] || 0) > 500000) {
            this.memory.terminalClearTask = this.kernel.getProcess(this.memory.terminalManager!)?.addTask({
                taskType: TerminalTaskType.SELL,
                resource: "energy",
                amount: 100000,
                priority: 100
            }, this.getPID(), 500)
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

