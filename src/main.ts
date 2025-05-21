import { InstanceBase, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdateVariableDefinitions } from './variables.js'
import { InitConnection, StopPolling } from './api.js'

export class ResiStudioInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	TOKEN?: string // Access token for API requests
	TOKEN_EXPIRY?: number // Expiry time for the access token in milliseconds

	CHOICES_ENCODERS: { id: string; label: string }[] = [] // List of encoders fetched from the API
	CHOICES_DESTINATION_GROUPS: { id: string; label: string }[] = [] // List of destination groups fetched from the API

	SCHEDULE_IDS: Schedule[] = [] // List of schedule IDs fetched from the API

	POLLING_INTERVAL: NodeJS.Timeout | undefined = undefined // Interval for fetching data from the API
	POLLING_RATE: number = 60000 // Default polling rate of 60 seconds
	POLLING_RUNNING: boolean = false // Flag to indicate if polling is running

	ENCODERS_WITH_ERRORS: { encoderId: string; errorMessage: string }[] = [] // List of encoders with errors

	constructor(internal: unknown) {
		super(internal)

		//populate choices_encoders with a default value
		this.CHOICES_ENCODERS = [{ id: 'default', label: 'Default Encoder' }]
		this.CHOICES_DESTINATION_GROUPS = [{ id: 'default', label: 'Default Destination Group' }]
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions

		await this.initConnection()
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		StopPolling(this) // Stop any ongoing polling
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config

		await this.initConnection()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	async initConnection(): Promise<void> {
		await InitConnection(this)
	}
}

runEntrypoint(ResiStudioInstance, UpgradeScripts)
