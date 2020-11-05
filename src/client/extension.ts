/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import fs = require('fs')
import path = require('path')
import {workspace, ExtensionContext, commands, RevealOutputChannelOn} from 'coc.nvim';
import {LanguageClient, LanguageClientOptions} from 'coc.nvim';

import {LanguageServerRepository, LanguageServerProvider, ILanguageServerPackages, sleep} from 'coc-utils'

const logger = workspace.createOutputChannel("coc-omnisharp")
const omnisharpLogger = workspace.createOutputChannel("omnisharp")
const omnisharpRepo: LanguageServerRepository = {
    kind: "github",
    repo: "omnisharp/omnisharp-roslyn",
    channel: "latest"
}

const omnisharpPacks: ILanguageServerPackages = {
    "win-x64": { platformPath: "omnisharp-win-x64.zip", executable: "Omnisharp.exe" },
    "linux-x64": { platformPath: "omnisharp-linux-x64.zip", executable: "run" },
    "osx-x64": { platformPath: "omnisharp-osx.zip", executable: "run" },
}

export async function activate(context: ExtensionContext) {

    logger.appendLine("coc-omnisharp activated.")
    logger.appendLine(`workspace root=${workspace.rootPath}`)

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for C#/VB documents
        documentSelector: [{scheme: 'file', language: 'cs'}, {scheme: 'file', language: 'vb'}],
        synchronize: {
            configurationSection: 'omnisharp',
            fileEvents: [
                workspace.createFileSystemWatcher('**/*.cs'),
                workspace.createFileSystemWatcher('**/*.csx'),
                workspace.createFileSystemWatcher('**/*.cake'),
                workspace.createFileSystemWatcher('**/*.vb')
            ]
        },
        outputChannel: omnisharpLogger,
    }

    const config = workspace.getConfiguration('omnisharp')
    const omnisharpCustomPath = config.get<string>('path')
    const loglevel = config.get<string>('trace.server')
    const debug = config.get<boolean>('debug.server')
    const useCustomPath = omnisharpCustomPath.length > 0;

    const omnisharpProvider = new LanguageServerProvider(context, "OmniSharp", omnisharpPacks, omnisharpRepo)
    const omnisharpExe = useCustomPath ? omnisharpCustomPath : await omnisharpProvider.getLanguageServer();

    // find the solution file
    let sln = fs.readdirSync(workspace.rootPath)
      .map(x => path.join(workspace.rootPath, x))
      .find(x => x.endsWith(".sln") && fs.statSync(x).isFile())

    logger.appendLine(`Solution file is: ${sln}`)

    let args = ["-lsp", "-s", sln]
    if (loglevel === "verbose") {
      args.push("-v")
      logger.appendLine("omnisharp verbose logging activated")
    }
    if (debug) {
      args.push("--debug")
      logger.appendLine("omnisharp debug mode activated")
    }

    let serverOptions = {
        command: omnisharpExe,
        args: args,
        options: {cwd: workspace.rootPath}
    }

    // Create the language client and start the client.
    let client = new LanguageClient('cs', 'OmniSharp Language Server', serverOptions, clientOptions);
    let client_dispose = client.start();
    // Push the disposable to the context's subscriptions so that the 
    // client can be deactivated on extension deactivation
    context.subscriptions.push(client_dispose);

    let cmd_updateomnisharp = commands.registerCommand('omnisharp.downloadLanguageServer', async () => {

        if (client.started) {
            await client.stop()
            client_dispose.dispose()
            await sleep(1000)
        }
        await omnisharpProvider.downloadLanguageServer()
        if (useCustomPath) {
            workspace.showMessage(`coc-omnisharp: Using custom executable (${omnisharpCustomPath}) so the downloaded bundle will have no effect`, 'warning')
        }
        client_dispose = client.start()
        context.subscriptions.push(client_dispose)
    })

    context.subscriptions.push(cmd_updateomnisharp)
}
