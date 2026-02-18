import init from "init";
import Kernel, { PROFILER_ALPHA } from "Kernel";
import { memoize } from "lodash";
import AttackCreepProcess from "processes/combat/AttackCreepProcess";
import HealingProcess from "processes/combat/HealingProcess";
import RemoteMiner from "processes/RemoteMiner";
import RoomManagerProcess from "processes/RoomManagerProcess";
import { ErrorMapper } from "utils/ErrorMapper";
declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Attack {
    healerProcess: number,
    attackProcess: number,
  }
  interface Memory {
    uuid: number;

    log: any;
    processes: Record<number, SerializedProcess>;
    pid_counter: number,
    profilingData: { [processName: string]: { lastRan: number, averageCPU: number } }
    attacks: { [roomName: string]: Attack}

  }
  interface FlagMemory {
    pid: number | undefined
  }

  interface CreepMemory {
    [string: string]: any
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }

  interface Message {
    from: number;
    type: string;
    payload: any
  }
  interface SerializedProcess {
    pid: number,
    type: string
    priority: number,
    parent: number,
    sleepUntil: number
    lastRan: number
    memory: any
    children: number[]
    averageCPUUsage: number
  }

  interface SpawnRequest {
    pid: number,
    partRatio: BodyPartConstant[]
    maxScale: number
  }
  function printProfilerData(): void
  function attack(roomName: string, attack: number, heal: number): void
  function stopAttack(roomName: string): void
  function remoteMine(parentRoom: string, childRoom: string): void


}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {

    global.remoteMine = function (parentRoom: string, childRoom: string) {
      let kernel = new Kernel();
      kernel.deserializeProcesses();
      let parentRoomManager = kernel.getProcess((kernel.getProcess(0)! as init).getRoomManager(parentRoom)!)!
      kernel.addProcess(new RemoteMiner(kernel, parentRoomManager.getPID(), parentRoom, childRoom))
      kernel.serializeProcesses()
    }

    global.attack = function (roomName: string, attack: number, heal: number) {
      let kernel = new Kernel();
      kernel.deserializeProcesses()
      if (!Memory.attacks) Memory.attacks = {}
        if (Memory.attacks[roomName]) {
            (kernel.getProcess(Memory.attacks[roomName].attackProcess) as AttackCreepProcess).setScale(attack);
            (kernel.getProcess(Memory.attacks[roomName].healerProcess) as HealingProcess).setScale(heal)
      } else {
        let attackProc = new AttackCreepProcess(kernel, 0, 0, attack, [TOUGH, TOUGH, ATTACK, MOVE, MOVE, MOVE], roomName, undefined)
        kernel.addProcess(attackProc)
        let healerProcess = new HealingProcess(kernel, 0, 0, heal, [TOUGH, TOUGH, HEAL, MOVE, MOVE, MOVE], roomName, undefined)
        kernel.addProcess(healerProcess)
        Memory.attacks[roomName] = {attackProcess: attackProc.getPID(), healerProcess: healerProcess.getPID()}
        }
      kernel.serializeProcesses()
    }
  global.stopAttack = function (roomName: string) {
    if(!Memory.attacks[roomName]) throw new Error("No Room Is Being Attacked")
    let kernel = new Kernel()
    kernel.deserializeProcesses()
    console.log(kernel.getProcess(Memory.attacks[roomName].attackProcess))
    kernel.getProcess(Memory.attacks[roomName].attackProcess)?.shutdown()
    kernel.getProcess(Memory.attacks[roomName].healerProcess)?.shutdown()
    kernel.serializeProcesses()
  }

  global.printProfilerData = function () {
    let profilingData = []
    for (let x in Memory.profilingData) {
      if (Memory.profilingData[x].lastRan < Game.time) {
        Memory.profilingData[x].averageCPU =
          Memory.profilingData[x].averageCPU *
          ((1-PROFILER_ALPHA) ** (Game.time - Memory.profilingData[x].lastRan))
          Memory.profilingData[x].lastRan = Game.time
      }
      profilingData.push({ name: x, usage: Memory.profilingData[x].averageCPU })
    }


    profilingData.sort((a, b) => b.usage - a.usage)
    console.log("------------PROFILING DATA-----------------")
    for (let proc of profilingData) {
      console.log(proc.name + ": " + proc.usage)
    }
    console.log("------------END PROFILING DATA-----------------")
  }
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
  let kernel = new Kernel();
  kernel.deserializeProcesses()
  if (kernel.getNumberOfProcesses() == 0) {
    kernel.addProcess(new init(kernel, 0));
  }
  kernel.runProcesses();
  kernel.serializeProcesses()

});
