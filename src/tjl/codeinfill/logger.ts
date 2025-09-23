import { OutputChannel, window } from "vscode"

let instance: MyLogger | undefined = undefined

export interface MyLogger {
	trace(message: string, ...args: any[]): void
	debug(message: string, ...args: any[]): void
	info(message: string, ...args: any[]): void
	warn(message: string, ...args: any[]): void
	error(error: string | Error, ...args: any[]): void
}

enum LogLevel {
	TRACE = 0,
	DEBUG,
	INFO,
	WARN,
	ERROR,
}

class VSCodeLogger implements MyLogger {
	private log: OutputChannel
	private logLevel: LogLevel

	constructor(log: OutputChannel, level: string = "INFO") {
		this.log = log
		this.logLevel = this.getLogLevel(level)
	}

	trace(message: string, ...args: any[]): void {
		this.appendLog(LogLevel.TRACE, "TRACE", message, ...args)
	}

	debug(message: string, ...args: any[]): void {
		this.appendLog(LogLevel.DEBUG, "DEBUG", message, ...args)
	}

	info(message: string, ...args: any[]): void {
		this.appendLog(LogLevel.INFO, "INFO", message, ...args)
	}

	warn(message: string, ...args: any[]): void {
		this.appendLog(LogLevel.WARN, "WARN", message, ...args)
	}

	error(error: string | Error, ...args: any[]): void {
		const message = error instanceof Error ? error.stack || error.message : error
		this.appendLog(LogLevel.ERROR, "ERROR", message, ...args)
	}

	private appendLog(level: LogLevel, levelStr: string, message: string, ...args: any[]): void {
		if (level >= this.logLevel) {
			const formattedMessage = `${levelStr}: ${message} ${args.join(" ")}`
			if (typeof this.log.appendLine === "function") {
				this.log.appendLine(formattedMessage)
			} else {
				this.log.append(formattedMessage)
			}
		}
	}

	private getLogLevel(level: string): LogLevel {
		switch (level.toUpperCase()) {
			case "TRACE":
				return LogLevel.TRACE
			case "DEBUG":
				return LogLevel.DEBUG
			case "INFO":
				return LogLevel.INFO
			case "WARN":
				return LogLevel.WARN
			case "ERROR":
				return LogLevel.ERROR
			default:
				return LogLevel.INFO
		}
	}
}

export class EmptyLogger implements MyLogger {
	trace(message: string, ...args: any[]): void {}
	debug(message: string, ...args: any[]): void {}
	info(message: string, ...args: any[]): void {}
	warn(message: string, ...args: any[]): void {}
	error(error: string | Error, ...args: any[]): void {}
}

export function logger(): MyLogger {
	if (!instance) {
		try {
			const outputChannel = window.createOutputChannel("CGP", { log: true })
			instance = new VSCodeLogger(outputChannel)
		} catch (error) {
			instance = new EmptyLogger()
		}
	}
	return instance
}
