// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '../../ui/legacy/legacy.js';
import '../../ui/components/markdown_view/markdown_view.js';
import '../../ui/components/spinners/spinners.js';
import '../../ui/components/tooltips/tooltips.js';

import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as WorkspaceDiff from '../../models/workspace_diff/workspace_diff.js';
import * as Buttons from '../../ui/components/buttons/buttons.js';
import * as UI from '../../ui/legacy/legacy.js';
import {html, type LitTemplate, nothing, render} from '../../ui/lit/lit.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';
import * as ChangesPanel from '../changes/changes.js';

import {type ResponseData, ResponseType} from './agents/AiAgent.js';
import {PatchAgent} from './agents/PatchAgent.js';

/*
* Strings that don't need to be translated at this time.
*/
const UIStringsNotTranslate = {
  /**
   *@description Text displayed for showing change summary view.
   */
  changeSummary: 'Changes summary',
  /**
   *@description Loading text displayed as a summary title when the patch suggestion is getting loaded
   */
  loadingPatchSuggestion: 'Applying to workspace…',
  /**
   *@description Button text for staging changes to workspace.
   */
  applyToWorkspace: 'Apply to workspace',
  /*
   *@description Button text to change the selected workspace
   */
  change: 'Change',
  /*
   *@description Button text to discard the suggested changes and not save them to file system
   */
  discard: 'Discard',
  /*
   *@description Button text to save all the suggested changes to file system
   */
  saveAll: 'Save all',
  /**
   *@description Button text while data is being loaded
   */
  loading: 'Loading...',
  /**
   *@description Label for the selected workspace/folder
   */
  selectedFolder: 'Selected folder:',
  /**
   *@description Disclaimer text shown for using code snippets with caution
   */
  codeDisclaimer: 'Use code snippets with caution',
  /**
   *@description Tooltip text for the info icon beside the "Apply to workspace" button
   */
  applyToWorkspaceTooltip: 'Source code from the selected folder is sent to Google to generate code suggestions'
} as const;

const lockedString = i18n.i18n.lockedString;

export interface ViewInput {
  workspaceDiff: WorkspaceDiff.WorkspaceDiff.WorkspaceDiffImpl;
  changeSummary?: string;
  patchSuggestion?: string;
  patchSuggestionLoading?: boolean;
  projectName?: string;
  onApplyToWorkspace?: () => void;
  onDiscard: () => void;
  onSaveAll: () => void;
}

type View = (input: ViewInput, output: undefined, target: HTMLElement) => void;

async function onChangeWorkspaceClick(): Promise<void> {
  await UI.UIUtils.ConfirmDialog.show(
      'Changing workspace is not implemented yet', 'Change workspace', undefined,
      {jslogContext: 'change-workspace-dialog'});
}

export class PatchWidget extends UI.Widget.Widget {
  changeSummary = '';

  #view: View;
  #aidaClient: Host.AidaClient.AidaClient;
  #project?: Workspace.Workspace.Project;
  #patchSuggestion?: string;
  #patchSuggestionLoading?: boolean;
  #workspaceDiff = WorkspaceDiff.WorkspaceDiff.workspaceDiff();
  #workspace = Workspace.Workspace.WorkspaceImpl.instance();

  constructor(element?: HTMLElement, view?: View, opts?: {
    aidaClient: Host.AidaClient.AidaClient,
  }) {
    super(false, false, element);
    this.#aidaClient = opts?.aidaClient ?? new Host.AidaClient.AidaClient();
    // clang-format off
    this.#view = view ?? ((input, output, target) => {
      if (!input.changeSummary) {
        return;
      }

      function renderHeader(): LitTemplate {
        if (input.patchSuggestionLoading) {
          return html`
            <devtools-spinner></devtools-spinner>
            <span class="header-text">
              ${lockedString(UIStringsNotTranslate.loadingPatchSuggestion)}
            </span>
          `;
        }

        if (input.patchSuggestion) {
          return html`
            <devtools-icon class="difference-icon" .name=${'difference'}></devtools-icon>
            <span class="header-text">
              ${lockedString(`File changes in ${input.projectName}`)}
            </span>
          `;
        }

        return html`
          <devtools-icon class="difference-icon" .name=${'pen-spark'}></devtools-icon>
          <span class="header-text">
            ${lockedString(UIStringsNotTranslate.changeSummary)}
          </span>
        `;
      }

      function renderContent(): LitTemplate {
        if (!input.changeSummary) {
          return nothing;
        }

        if (input.patchSuggestion) {
          return html`<devtools-widget .widgetConfig=${UI.Widget.widgetConfig(ChangesPanel.CombinedDiffView.CombinedDiffView, {
            workspaceDiff: input.workspaceDiff,
          })}></devtools-widget>`;
        }

        return html`<devtools-code-block
          .code=${input.changeSummary}
          .codeLang=${'css'}
          .displayNotice=${true}
        ></devtools-code-block>`;
      }

      function renderFooter(): LitTemplate {
        if (input.patchSuggestionLoading) {
          return nothing;
        }

        if (input.patchSuggestion) {
          return html`
          <div class="footer">
            <x-link class="link disclaimer-link" href="https://support.google.com/legal/answer/13505487" jslog=${
              VisualLogging.link('code-disclaimer').track({
                click: true,
              })}>
              ${lockedString(UIStringsNotTranslate.codeDisclaimer)}
            </x-link>
            <div class="save-or-discard-buttons">
              <devtools-button
                @click=${input.onDiscard}
                .jslogContext=${'discard'}
                .variant=${Buttons.Button.Variant.OUTLINED}>
                  ${lockedString(UIStringsNotTranslate.discard)}
              </devtools-button>
              <devtools-button
                @click=${input.onSaveAll}
                .jslogContext=${'save-all'}
                .variant=${Buttons.Button.Variant.PRIMARY}>
                  ${lockedString(UIStringsNotTranslate.saveAll)}
              </devtools-button>
            </div>
          </div>
          `;
        }

        return html`
        <div class="footer">
          <div class="change-workspace">
            <div class="selected-folder">
              ${lockedString(UIStringsNotTranslate.selectedFolder)} ${input.projectName}
            </div>
            <devtools-button
              @click=${onChangeWorkspaceClick}
              .jslogContext=${'change-workspace'}
              .variant=${Buttons.Button.Variant.TEXT}>
                ${lockedString(UIStringsNotTranslate.change)}
            </devtools-button>
          </div>
          <div class="apply-to-workspace-container">
            <devtools-button
              class="apply-to-workspace"
              @click=${input.onApplyToWorkspace}
              .jslogContext=${'stage-to-workspace'}
              .variant=${Buttons.Button.Variant.OUTLINED}>
              ${lockedString(UIStringsNotTranslate.applyToWorkspace)}
            </devtools-button>
            <devtools-icon aria-describedby="info-tooltip" .name=${'info'}></devtools-icon>
            <devtools-tooltip id="info-tooltip">${lockedString(UIStringsNotTranslate.applyToWorkspaceTooltip)}</devtools-tooltip>
          </div>
        </div>`;
      }

      render(
        html`
          <details class="change-summary">
            <summary>
              ${renderHeader()}
              <devtools-icon
                class="arrow"
                .name=${'chevron-down'}
              ></devtools-icon>
            </summary>
            ${renderContent()}
            ${renderFooter()}
          </details>
        `,
        target,
        {host: target}
      );
    });
    // clang-format on
    this.requestUpdate();
  }

  override performUpdate(): void {
    const viewInput = {
      workspaceDiff: this.#workspaceDiff,
      changeSummary: this.changeSummary,
      patchSuggestion: this.#patchSuggestion,
      patchSuggestionLoading: this.#patchSuggestionLoading,
      projectName: this.#project?.displayName(),
      onApplyToWorkspace: this.#onApplyToWorkspace.bind(this),
      onDiscard: this.#onDiscard.bind(this),
      onSaveAll: this.#onSaveAll.bind(this),
    };
    this.#view(viewInput, undefined, this.contentElement);
  }

  override wasShown(): void {
    super.wasShown();
    this.#selectProject();

    if (isAiAssistancePatchingEnabled()) {
      this.#workspace.addEventListener(Workspace.Workspace.Events.ProjectAdded, this.#onProjectAddedOrRemoved, this);
      this.#workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.#onProjectAddedOrRemoved, this);

      // @ts-expect-error temporary global function for local testing.
      window.aiAssistanceTestPatchPrompt = async (changeSummary: string) => {
        return await this.#applyPatch(changeSummary);
      };
    }
  }

  override willHide(): void {
    if (isAiAssistancePatchingEnabled()) {
      this.#workspace.removeEventListener(Workspace.Workspace.Events.ProjectAdded, this.#onProjectAddedOrRemoved, this);
      this.#workspace.removeEventListener(
          Workspace.Workspace.Events.ProjectRemoved, this.#onProjectAddedOrRemoved, this);
    }
  }

  #selectProject(): void {
    if (isAiAssistancePatchingEnabled()) {
      // TODO: this is temporary code that should be replaced with
      // workflow selection flow. For now it picks the first Workspace
      // project that is not Snippets.
      const projects = this.#workspace.projectsForType(Workspace.Workspace.projectTypes.FileSystem);
      this.#project = undefined;
      for (const project of projects) {
        // This is for TypeScript to narrow the types. projectsForType()
        // probably only returns instances of
        // Persistence.FileSystemWorkspaceBinding.FileSystem.
        if (!(project instanceof Persistence.FileSystemWorkspaceBinding.FileSystem)) {
          continue;
        }
        if (project.fileSystem().type() !== Persistence.PlatformFileSystem.PlatformFileSystemType.WORKSPACE_PROJECT) {
          continue;
        }
        this.#project = project;
        this.requestUpdate();
        break;
      }
    }
  }

  #onProjectAddedOrRemoved(): void {
    this.#selectProject();
  }

  async #onApplyToWorkspace(): Promise<void> {
    if (!isAiAssistancePatchingEnabled()) {
      return;
    }
    const changeSummary = this.changeSummary;
    if (!changeSummary) {
      throw new Error('Change summary does not exist');
    }

    this.#patchSuggestionLoading = true;
    this.requestUpdate();
    const response = await this.#applyPatch(changeSummary);
    this.#patchSuggestion = response?.type === ResponseType.ANSWER ? response.text : 'Could not update files';
    this.#patchSuggestionLoading = false;
    this.requestUpdate();
  }

  #onDiscard(): void {
    // TODO: Remove changes from the working copies as well.
    this.#patchSuggestion = undefined;
    this.requestUpdate();
  }

  #onSaveAll(): void {
    // TODO: Handle saving all the files.
  }

  async #applyPatch(changeSummary: string): Promise<ResponseData|undefined> {
    if (!this.#project) {
      throw new Error('Project does not exist');
    }
    const agent = new PatchAgent({
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: false,
      project: this.#project,
    });
    const responses = await Array.fromAsync(agent.applyChanges(changeSummary));
    return responses.at(-1);
  }
}

export function isAiAssistancePatchingEnabled(): boolean {
  const {hostConfig} = Root.Runtime;
  return Boolean(hostConfig.devToolsFreestyler?.patching);
}
