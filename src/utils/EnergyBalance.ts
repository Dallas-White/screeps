export interface EnergyConsumer {
    resetEnergyConsumption(): void
    getConsumptionTimer(): number;
    getAverageEnergyConsumption(): number

}

export interface EnergyProducer {
    resetEnergyProduction(): void
    getProductionTimer(): number;
    getAverageEnergyProduction(): number;
}
