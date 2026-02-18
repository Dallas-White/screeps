# Screeps AI

This is my code for an AI designed for the game [Screeps](https://screeps.com/). Screeps is an MMO where players program autonomous bots to compete for resources like energy, power, and space in an open game world. Processing time and memory usage are also constrained

## Operating System Design

My AI is designed to operate like an Operating System. It is divided into small pieces of code called processes, each process is responsible for a specific part of running the colony, they can have subprocesses and are killed when their parent process dies. The kernel keeps track of processes and decides what processes will run every tick. Inter-process communication is done through method calls, when a process wants to communicate with another process it gets the target's process object from the kernel and calls methods to communiate. the first process is called the "init" process, it has no parent and can not be killed. the init process is responsible for starting every other process.

 this AI is written in typescript using the [Screeps Typescript Starter](https://github.com/screepers/screeps-typescript-starter).

## Energy Balancing

The Room Mananger process attempts to keep track of all of the energy produced and consumed in the room, processes can implement the interfaces "EnergyProvider" and "EnergyConsumer" to declare that they either provide or consume energy. Every few thousand ticks the Room Manager looks at the energy flowing in and out through providers and consumers. If it detects a surplus it scales up scaleable consumers and if it detects a deficit it scales down scaleable consumers.

##
