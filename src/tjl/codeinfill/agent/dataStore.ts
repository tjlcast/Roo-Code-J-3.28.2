import { PartialAgentConfig } from "./AgentConfig"

export type StoredData = {
	anonymousId: string
	auth: { [endpoint: string]: { jwt: string } }
	serverConfig: { [endpoint: string]: PartialAgentConfig }
}

export interface DataStore {
	data: Partial<StoredData>
	load(): PromiseLike<void>
	save(): PromiseLike<void>
}
