import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import ClaimProcess from "./claimFlag";
import { object } from "lodash";
import ClearFlag from "./ClearFlag";
import { spawn } from "child_process";
import Hauler from "processes/Hauler";
import init from "init";
import PillagerProcess from "processes/combat/PillagerProecss";
import { SpawnManager } from "SpawnManager";

export class FlagHandler extends Process {

    constructor(kernel: Kernel, parent: Process) {
        super(kernel, parent, {});
    }
    run(): void {
        for (let x in Memory.flags) {
            if (!(x in Game.flags) && Memory.flags[x].pid) {
                this.kernel.getProcess(Memory.flags[x].pid!)?.shutdown()
                delete Memory.flags[x]
            }
        }
        for (let x of Object.keys(Game.flags)) {
            if (Memory.flags[x]?.pid) {
                if (!this.kernel.getProcess(Game.flags[x].memory.pid!)) {
                    Game.flags[x].memory.pid = undefined
                    Game.flags[x].remove()
                }
            } else {
                if (!Game.flags[x].memory.pid && FlagHandlerRegistry.get(x)) {
                    let proc = FlagHandlerRegistry.get(x)!(this.kernel, this, this.getParent() as SpawnManager, Game.flags[x])
                    this.kernel.addProcess(proc)
                    Game.flags[x].memory.pid = proc.getPID()
                }
            }
        }

    }
    getType(): string {
        return "FlagHandler"
    }

}

ProcessRegistry.register("FlagHandler", FlagHandler)

export default class FlagHandlerRegistry {
    private static handlerMap = new Map<string, (kernel: Kernel, parent: Process, spawnManager: SpawnManager, f: Flag) => Process>()

    static register(prefix: string, handler: (kernel: Kernel, parent: Process, spawnManager: SpawnManager, f: Flag) => Process) {
        this.handlerMap.set(prefix.toLowerCase(), handler)
    }

    static get(flagname: string): ((kernel: Kernel, parent: Process, spawnManager: SpawnManager, f: Flag) => Process) | undefined {
        for (let x of this.handlerMap.keys()) {
            if (flagname.toLocaleLowerCase().startsWith(x)) {
                return this.handlerMap.get(x)!
            }
        }
        return undefined
    }
}
FlagHandlerRegistry.register("claim", (kernel, parent, spawnManager, flag) =>
    new ClaimProcess(kernel, parent, spawnManager, flag))

FlagHandlerRegistry.register("clear", (kernel, parent, spawnManager, flag) =>
    new ClearFlag(kernel, parent, spawnManager, flag))

FlagHandlerRegistry.register("pillage", (Kernel, parent, spawnManager, flag): Process => {
    let destinationRoom = Object.keys(Game.rooms).filter(rn => Game.rooms[rn].controller?.my).sort((a, b) => Game.map.getRoomLinearDistance(a, flag.pos.roomName) - Game.map.getRoomLinearDistance(b, flag.pos.roomName))[0];
    let destinationRoomProc = Kernel.getProcess((Kernel.getProcess(0 as Pid<init>) as init).getRoomManager(destinationRoom)!)!
    return new PillagerProcess(Kernel, parent, destinationRoomProc, flag.pos.roomName, destinationRoom, 5);
})
