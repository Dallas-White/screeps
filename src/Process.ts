import type Kernel from "Kernel";


const memoryAverageFactor = 0.2

abstract class Process {
    private pid: number
    private parent: number
    kernel: Kernel
    priority: number = 1
    lastRan: number = 0
    sleepUntil: number = 0
    private averageCPUUsage = 0
    children: number[] = []
    protected memory: any = {}

    constructor(kernel: Kernel, parent: number) {
        this.pid = kernel.getAvailablePID();
        this.kernel = kernel
        this.parent = parent
    }


    updateAverageCPUUsage(newUsage: number) {
        this.averageCPUUsage = this.averageCPUUsage * (1 - memoryAverageFactor) + newUsage * memoryAverageFactor;
    }

    getAverageCPUUsage() {
        return this.averageCPUUsage;
    }

    getPID(): number {
        return this.pid;
    }

    setPID(pid:number) {
        this.pid = pid
    }

    shutdown() {
        this.kernel.killProcess(this.pid)
    }

    getKernel(): Kernel {
        return this.kernel;
    }

    abstract run(): void

    abstract getType(): string;

    serialize(): SerializedProcess {
        return {
            pid: this.pid,
            type: this.getType(),
            priority: this.priority,
            lastRan: this.lastRan,
            sleepUntil: this.sleepUntil,
            memory: this.memory,
            children: this.children,
            averageCPUUsage: this.averageCPUUsage,
            parent: this.parent
        };
    }

    loadFromSerialized(data: SerializedProcess, kernel: Kernel) {
        this.pid = data.pid;
        this.priority = data.priority;
        this.lastRan = data.lastRan;
        this.sleepUntil = data.sleepUntil;
        this.memory = data.memory || {};
        this.kernel = kernel;
        this.children = data.children
        this.averageCPUUsage = data.averageCPUUsage;
        this.parent = data.parent
      }
    sleep(ticks:number = 0) {
        if (!ticks)
            this.sleepUntil = Number.MAX_SAFE_INTEGER;
        else
            this.sleepUntil = Game.time + ticks;
    }

    getChildren(): number[] {
        return this.children;
    }

    addChild(child: number) {
           this.children.push(child);
    }

    removeChild(child: number) {
        this.children.splice(this.children.indexOf(child), 1)
    }

    getParent(): number {
        return this.parent;
    }

}
export default Process


export class ProcessRegistry {
    private static registry = new Map < string, abstract new (...args: any[]) => Process>();

    static register(type: string, cls: abstract new (...args: any[]) => Process) {
        this.registry.set(type, cls);
    }

    static deserialize(data: SerializedProcess, kernel: Kernel): Process {
        const cls = this.registry.get(data.type);
        if (!cls) {
            throw new Error(`Unknown process type: ${data.type}`);
        }

        // Create instance without calling constructor
        const instance = Object.create(cls.prototype) as Process;
        instance.loadFromSerialized(data, kernel);
        return instance;
    }

  }
