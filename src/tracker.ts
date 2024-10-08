import * as vscode from 'vscode';
import { VariableViewPanel } from './panel';
import { register } from 'module';

import { DebugSessionTracker } from './variable/debugSessionTracker';
import { DebugVariable } from './variable/debugVariable';
import { VariableTypeFactory } from './variable/variableTypeFactory';
import { ImageVariable } from './variable/imageVariable';

export class VariableTracker implements vscode.DebugAdapterTracker {
    private _context: vscode.ExtensionContext;
    private _panel: VariableViewPanel | undefined;
    private _sessionTracker: DebugSessionTracker | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public async onDidSendMessage(message: any) {
        // console.log("onDidSendMessage", Object.assign({}, message));

        if (message.type === 'event' && message.event === 'stopped') {
            const enable = await vscode.workspace.getConfiguration().get('debug-variable-actions.config.enable');
            if (enable) {
                await this.procImagePanel(message);
            } else {
                console.log("debug-variable-actions.config.enable is", enable);
            }
        }
    }

    async procImagePanel(message: any) {
        VariableTypeFactory.loadSettings();

        VariableViewPanel.render(this._context);
        const panel = VariableViewPanel.currentPanel;
        if (panel) {
            // panel.showPanel();
        }
        VariableViewPanel.sendInstanceMessage("WAIT FOR IMAGES...");


        const session = vscode.debug.activeDebugSession;

        // Create new tracker to manage debug variables every frames and threads,
        //   not to share them among debug trackers even if they have same session.
        DebugSessionTracker.newSessionTracker(this._context, session!);
        let sessionTracker = DebugSessionTracker.currentTracker!;
        DebugSessionTracker.breakCount++;
        const threadId = message.body.threadId;

        // const stackTrace = await session?.customRequest('stackTrace', { threadId });
        // const frameId = stackTrace.stackFrames[0].id;
        // const scopes = await session?.customRequest('scopes', { frameId });

        // console.log(frameId);
        // console.log(stackTrace);
        // console.log("scopes", scopes);
        // for (const scope of scopes.scopes) {
        //     const variables = await session?.customRequest('variables', { variablesReference: scope.variablesReference });
        //     console.log(variables);
        //     // Here you can process the variables as needed
        // }

        console.log("fetchLocalVariablesInFirstFrame", sessionTracker);
        const thread = sessionTracker.addThread(threadId, [], message.body);
        const variables = await thread.fetchLocalVariablesInFirstFrame();
        console.log("fetchLocalVariablesInFirstFrame", variables);

        let values: any = [];
        variables.forEach((variable: DebugVariable) => {
            values.push(variable.getVariableValuesAsDict());
        });
        console.log("values", values);

        const allVariables = sessionTracker.gatherAllVariables();
        console.log(allVariables);

        const imageVariables: ImageVariable[] = sessionTracker.gatherImageVariables();
        console.log(imageVariables);

        const imageMetaWides = [];
        for (const imageVariable of imageVariables) {
            imageVariable.updateImageInfo();
            imageVariable.updateBinaryInfo();
            const metaWide = await imageVariable.toFile(); // toFile() may return undefined if the image could not read properly.
            if (metaWide) {
                imageMetaWides.push(metaWide);
            }
            // imageVariable.toFile();
        }


        console.log("rendering panel");
        VariableViewPanel.render(this._context, "image-panel");
        if (panel) {
            // Set web url
            for (const metaWide of imageMetaWides) {
                metaWide.imageWebUrl = panel.getWebViewUrlString(vscode.Uri.file(metaWide.vscode.filePath));
            }
            console.log("imageMetaWides", imageMetaWides);

            // Display
            // const openPath = vscode.Uri.file(filePath.toString()).toString().replace("/file:", "");
            // vscode.commands.executeCommand('vscode.open', filePath.fsPath);
            console.log("showing images on panel", panel);
            const workspaceFolders = vscode.workspace.workspaceFolders;
            panel.postMessage({
                command: "images",
                metas: imageMetaWides,
                breakpointMeta: message.body,
                vscodeMeta: { workspaceFolders }

            });
            panel.showPanel();

            console.log("DONE!!");
        } else {
            console.log("panel is undefined");
        }

        console.log("DONE!!!!!!!!!!!");
        VariableViewPanel.postMessage({ command: "capture" });
        VariableViewPanel.sendInstanceMessage("DONE!");
    }

    //     public onDidSendMessage(message: any) {
    //         console.log(Object.assign({}, message));
    //         if ((message.type === 'event' && message.event === 'output') ||
    //             (message.type === 'response' && message.command === 'evaluate')) {
    //             console.log(Object.assign({}, message));
    //             if ((message.body && message.body.category === 'stdout') ||
    //                 (message.boy)) {
    //                 console.log('message.body', message.body);
    //                 if (!this._panel) {
    //                     console.log("this._panel is undefined")
    //                     this._panel = new VariableViewPanel(this._context);
    //                 }
    //                 else{
    //                     console.log("this._panel is NOT undefined")
    //                 }
    //                 console.log("this._panel.isPanelExist 1", this._panel.isPanelExist());
    //                 this._panel.render();
    //                 this._panel.showPanel(vscode.ViewColumn.Two);
    //                 console.log("this._panel.isPanelExist 2", this._panel.isPanelExist());

    //                 let variableOut = {
    //                     message,
    //                     name: message.body.variablesReference,
    //                     value: message.body.output
    //                 };

    //                 console.log("this._panel.isPanelExist 3", this._panel.isPanelExist());
    //                 console.log("posting message to panel")
    //                 this._panel.postMessage({ command: 'variable', output: variableOut });
    //                 console.log("this._panel.isPanelExist 4", this._panel.isPanelExist());
    //             }
    //         }
    //     }
}


export class VariableTrackerRegister implements vscode.DebugAdapterTrackerFactory {
    private variableTracker: VariableTracker;
    public readonly context: vscode.ExtensionContext;

    constructor(_context: vscode.ExtensionContext) {
        this.variableTracker = new VariableTracker(_context);
        this.context = _context;
    }

    createDebugAdapterTracker(session: vscode.DebugSession):
        vscode.ProviderResult<vscode.DebugAdapterTracker> {
        console.log("sessoin!", session);
        DebugSessionTracker.newSessionTracker(this.context, session);
        DebugSessionTracker.breakCount = 0; // FIXME: It should better to manage not by a static.
        return this.variableTracker;
    }

    static register(context: vscode.ExtensionContext): vscode.Disposable {
        console.log(context);
        return vscode.debug.registerDebugAdapterTrackerFactory('*', new VariableTrackerRegister(context));
    }
}
