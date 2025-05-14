import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'

import type { ResiStudioInstance } from './main.js'

export function UpdateVariableDefinitions(self: ResiStudioInstance): void {
	const variables: CompanionVariableDefinition[] = []

	variables.push({ variableId: 'encoderErrorStatus', name: 'Encoder Error Status' })

	self.setVariableDefinitions(variables)
}

export function CheckVariables(self: ResiStudioInstance): void {
	const variableValues: CompanionVariableValues = {}

	self.setVariableValues(variableValues)
}
