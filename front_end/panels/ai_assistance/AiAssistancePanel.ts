// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '../../ui/legacy/legacy.js';

import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import type * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Lit from '../../ui/lit/lit.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';
import * as ElementsPanel from '../elements/elements.js';
import * as NetworkForward from '../network/forward/forward.js';
import * as NetworkPanel from '../network/network.js';
import * as SourcesPanel from '../sources/sources.js';
import * as TimelinePanel from '../timeline/timeline.js';
import * as TimelineUtils from '../timeline/utils/utils.js';

import {
  AgentType,
  type AiAgent,
  type ConversationContext,
  ErrorType,
  type ResponseData,
  ResponseType,
} from './agents/AiAgent.js';
import {
  FileAgent,
  FileContext,
} from './agents/FileAgent.js';
import {
  NetworkAgent,
  RequestContext,
} from './agents/NetworkAgent.js';
import {PatchAgent, ProjectContext} from './agents/PatchAgent.js';
import {CallTreeContext, PerformanceAgent} from './agents/PerformanceAgent.js';
import {InsightContext, PerformanceInsightsAgent} from './agents/PerformanceInsightsAgent.js';
import {NodeContext, StylingAgent, StylingAgentWithFunctionCalling} from './agents/StylingAgent.js';
import aiAssistancePanelStyles from './aiAssistancePanel.css.js';
import {AiHistoryStorage, Conversation, ConversationType} from './AiHistoryStorage.js';
import {ChangeManager} from './ChangeManager.js';
import {
  type ChatMessage,
  ChatMessageEntity,
  ChatView,
  type ModelChatMessage,
  type Props as ChatViewProps,
  State as ChatViewState,
  type Step
} from './components/ChatView.js';

const {html} = Lit;

const AI_ASSISTANCE_SEND_FEEDBACK = 'https://crbug.com/364805393' as Platform.DevToolsPath.UrlString;
const AI_ASSISTANCE_HELP = 'https://goo.gle/devtools-ai-assistance' as Platform.DevToolsPath.UrlString;
const SCREENSHOT_QUALITY = 100;

const UIStrings = {
  /**
   *@description AI assistance UI text creating a new chat.
   */
  newChat: 'New chat',
  /**
   *@description AI assistance UI tooltip text for the help button.
   */
  help: 'Help',
  /**
   *@description AI assistant UI tooltip text for the settings button (gear icon).
   */
  settings: 'Settings',
  /**
   *@description AI assistant UI tooltip sending feedback.
   */
  sendFeedback: 'Send feedback',
  /**
   *@description Announcement text for screen readers when a new chat is created.
   */
  newChatCreated: 'New chat created',
  /**
   *@description Announcement text for screen readers when the chat is deleted.
   */
  chatDeleted: 'Chat deleted',
  /**
   *@description AI assistance UI text creating selecting a history entry.
   */
  history: 'History',
  /**
   *@description AI assistance UI text deleting the current chat session from local history.
   */
  deleteChat: 'Delete local chat',
  /**
   *@description AI assistance UI text that deletes all local history entries.
   */
  clearChatHistory: 'Clear local chats',
  /**
   *@description AI assistance UI text explains that he user had no pas conversations.
   */
  noPastConversations: 'No past conversations',
};

/*
* Strings that don't need to be translated at this time.
*/
const UIStringsNotTranslate = {

  /**
   *@description Announcement text for screen readers when the conversation starts.
   */
  answerLoading: 'Answer loading',
  /**
   *@description Announcement text for screen readers when the answer comes.
   */
  answerReady: 'Answer ready',
};

const str_ = i18n.i18n.registerUIStrings('panels/ai_assistance/AiAssistancePanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const lockedString = i18n.i18n.lockedString;

interface ViewOutput {
  chatView?: ChatView;
}
type View = (input: ChatViewProps, output: ViewOutput, target: HTMLElement) => void;

function selectedElementFilter(maybeNode: SDK.DOMModel.DOMNode|null): SDK.DOMModel.DOMNode|null {
  if (maybeNode) {
    return maybeNode.nodeType() === Node.ELEMENT_NODE ? maybeNode : null;
  }

  return null;
}

function defaultView(input: ChatViewProps, output: ViewOutput, target: HTMLElement): void {
  // clang-format off
  Lit.render(html`
    <devtools-ai-chat-view .props=${input} ${Lit.Directives.ref((el: Element|undefined) => {
      if (!el || !(el instanceof ChatView)) {
        return;
      }

      output.chatView = el;
    })}></devtools-ai-chat-view>
  `, target, {host: input});
  // clang-format on
}

function createNodeContext(node: SDK.DOMModel.DOMNode|null): NodeContext|null {
  if (!node) {
    return null;
  }
  return new NodeContext(node);
}

function createFileContext(file: Workspace.UISourceCode.UISourceCode|null): FileContext|null {
  if (!file) {
    return null;
  }
  return new FileContext(file);
}

function createRequestContext(request: SDK.NetworkRequest.NetworkRequest|null): RequestContext|null {
  if (!request) {
    return null;
  }
  return new RequestContext(request);
}

function createCallTreeContext(callTree: TimelineUtils.AICallTree.AICallTree|null): CallTreeContext|null {
  if (!callTree) {
    return null;
  }
  return new CallTreeContext(callTree);
}
function createPerfInsightContext(insight: TimelineUtils.InsightAIContext.ActiveInsight|null): InsightContext|null {
  if (!insight) {
    return null;
  }
  return new InsightContext(insight);
}

function agentTypeToConversationType(type: AgentType): ConversationType {
  switch (type) {
    case AgentType.STYLING:
      return ConversationType.STYLING;
    case AgentType.NETWORK:
      return ConversationType.NETWORK;
    case AgentType.FILE:
      return ConversationType.FILE;
    case AgentType.PERFORMANCE:
      return ConversationType.PERFORMANCE;
    case AgentType.PERFORMANCE_INSIGHT:
      return ConversationType.PERFORMANCE_INSIGHT;
    case AgentType.PATCH:
      throw new Error('PATCH AgentType does not have a corresponding ConversationType.');
  }
}

let panelInstance: AiAssistancePanel;
export class AiAssistancePanel extends UI.Panel.Panel {
  static panelName = 'freestyler';

  #toggleSearchElementAction: UI.ActionRegistration.Action;
  #contentContainer: HTMLElement;
  #aidaClient: Host.AidaClient.AidaClient;
  #viewOutput: ViewOutput = {};
  #serverSideLoggingEnabled = isAiAssistanceServerSideLoggingEnabled();
  #aiAssistanceEnabledSetting: Common.Settings.Setting<boolean>|undefined;
  #changeManager = new ChangeManager();
  #mutex = new Common.Mutex.Mutex();

  #newChatButton =
      new UI.Toolbar.ToolbarButton(i18nString(UIStrings.newChat), 'plus', undefined, 'freestyler.new-chat');
  #historyEntriesButton =
      new UI.Toolbar.ToolbarButton(i18nString(UIStrings.history), 'history', undefined, 'freestyler.history');
  #deleteHistoryEntryButton =
      new UI.Toolbar.ToolbarButton(i18nString(UIStrings.deleteChat), 'bin', undefined, 'freestyler.delete');

  #currentAgent?: AiAgent<unknown>;
  #currentConversation?: Conversation;
  #conversations: Conversation[] = [];

  #previousSameOriginContext?: ConversationContext<unknown>;
  #selectedFile: FileContext|null = null;
  #selectedElement: NodeContext|null = null;
  #selectedCallTree: CallTreeContext|null = null;
  #selectedPerformanceInsight: InsightContext|null = null;
  #selectedRequest: RequestContext|null = null;

  // Messages displayed in the `ChatView` component.
  #messages: ChatMessage[] = [];
  // Indicates whether the new conversation context is blocked due to cross-origin restrictions.
  // This happens when the conversation's context has a different
  // origin than the selected context.
  #blockedByCrossOrigin: boolean = false;
  // Whether the UI should show loading or not.
  #isLoading: boolean = false;
  // Selected conversation context. The reason we keep this as a
  // state field rather than using `#getConversationContext` is that,
  // there is a case where the context differs from the selectedElement (or other selected context type).
  // Specifically, it allows restoring the previous context when a new selection is cross-origin.
  // See `#onContextSelectionChanged` for details.
  #selectedContext: ConversationContext<unknown>|null = null;
  // Stores the availability status of the `AidaClient` and the reason for unavailability, if any.
  #aidaAvailability: Host.AidaClient.AidaAccessPreconditions;
  // Info of the currently logged in user.
  #userInfo: {
    accountImage?: string,
    accountFullName?: string,
  };
  #project?: Workspace.Workspace.Project;
  #patchSuggestion?: string;
  #patchSuggestionLoading?: boolean;
  #imageInput: string = '';

  constructor(private view: View = defaultView, {aidaClient, aidaAvailability, syncInfo}: {
    aidaClient: Host.AidaClient.AidaClient,
    aidaAvailability: Host.AidaClient.AidaAccessPreconditions,
    syncInfo: Host.InspectorFrontendHostAPI.SyncInformation,
  }) {
    super(AiAssistancePanel.panelName);
    this.registerRequiredCSS(aiAssistancePanelStyles);
    this.#aiAssistanceEnabledSetting = this.#getAiAssistanceEnabledSetting();

    this.#createToolbar();
    this.#toggleSearchElementAction =
        UI.ActionRegistry.ActionRegistry.instance().getAction('elements.toggle-element-search');
    this.#aidaClient = aidaClient;
    this.#contentContainer = this.contentElement.createChild('div', 'chat-container');
    this.#aidaAvailability = aidaAvailability;
    this.#userInfo = {
      accountImage: syncInfo.accountImage,
      accountFullName: syncInfo.accountFullName,
    };

    this.#conversations = AiHistoryStorage.instance().getHistory().map(item => Conversation.fromSerialized(item));

    if (isAiAssistancePatchingEnabled()) {
      // TODO: this is temporary code that should be replaced with workflow selection flow.
      // For now it picks the first Workspace project that is not Snippets.
      const projects =
          Workspace.Workspace.WorkspaceImpl.instance().projectsForType(Workspace.Workspace.projectTypes.FileSystem);
      this.#project = undefined;
      for (const project of projects) {
        if (project.displayName().trim() === '') {
          continue;
        }
        this.#project = project;
        break;
      }
    }
  }

  #createToolbar(): void {
    const toolbarContainer = this.contentElement.createChild('div', 'toolbar-container');
    toolbarContainer.setAttribute('jslog', VisualLogging.toolbar().toString());
    toolbarContainer.role = 'toolbar';
    const leftToolbar = toolbarContainer.createChild('devtools-toolbar', 'freestyler-left-toolbar');
    leftToolbar.role = 'presentation';
    const rightToolbar = toolbarContainer.createChild('devtools-toolbar', 'freestyler-right-toolbar');
    rightToolbar.role = 'presentation';

    this.#newChatButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, this.#handleNewChatRequest.bind(this));
    leftToolbar.appendToolbarItem(this.#newChatButton);
    leftToolbar.appendSeparator();

    this.#historyEntriesButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, event => {
      this.#onHistoryClicked(event.data);
    });
    leftToolbar.appendToolbarItem(this.#historyEntriesButton);
    this.#deleteHistoryEntryButton.addEventListener(
        UI.Toolbar.ToolbarButton.Events.CLICK, this.#onDeleteClicked.bind(this));
    leftToolbar.appendToolbarItem(this.#deleteHistoryEntryButton);

    const link = UI.XLink.XLink.create(
        AI_ASSISTANCE_SEND_FEEDBACK, i18nString(UIStrings.sendFeedback), undefined, undefined,
        'freestyler.send-feedback');
    link.style.setProperty('display', null);
    link.style.setProperty('color', 'var(--sys-color-primary)');
    link.style.setProperty('margin', '0 var(--sys-size-3)');
    link.style.setProperty('height', 'calc(100% - 6px)');
    const linkItem = new UI.Toolbar.ToolbarItem(link);
    rightToolbar.appendToolbarItem(linkItem);

    rightToolbar.appendSeparator();
    const helpButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.help), 'help', undefined, 'freestyler.help');
    helpButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, () => {
      Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(AI_ASSISTANCE_HELP);
    });
    rightToolbar.appendToolbarItem(helpButton);

    const settingsButton =
        new UI.Toolbar.ToolbarButton(i18nString(UIStrings.settings), 'gear', undefined, 'freestyler.settings');
    settingsButton.addEventListener(UI.Toolbar.ToolbarButton.Events.CLICK, () => {
      void UI.ViewManager.ViewManager.instance().showView('chrome-ai');
    });
    rightToolbar.appendToolbarItem(settingsButton);
  }

  #getChatUiState(): ChatViewState {
    const blockedByAge = Root.Runtime.hostConfig.aidaAvailability?.blockedByAge === true;
    return (this.#aiAssistanceEnabledSetting?.getIfNotDisabled() && !blockedByAge) ? ChatViewState.CHAT_VIEW :
                                                                                     ChatViewState.CONSENT_VIEW;
  }

  #getAiAssistanceEnabledSetting(): Common.Settings.Setting<boolean>|undefined {
    try {
      return Common.Settings.moduleSetting('ai-assistance-enabled') as Common.Settings.Setting<boolean>;
    } catch {
      return;
    }
  }

  #createAgent(agentType: AgentType): AiAgent<unknown> {
    const options = {
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    };
    let agent: AiAgent<unknown>;
    switch (agentType) {
      case AgentType.STYLING: {
        agent = new StylingAgent({
          ...options,
          changeManager: this.#changeManager,
        });
        if (isAiAssistanceStylingWithFunctionCallingEnabled()) {
          agent = new StylingAgentWithFunctionCalling({
            ...options,
            changeManager: this.#changeManager,
          });
        }

        break;
      }
      case AgentType.NETWORK: {
        agent = new NetworkAgent(options);
        break;
      }
      case AgentType.FILE: {
        agent = new FileAgent(options);
        break;
      }
      case AgentType.PERFORMANCE: {
        agent = new PerformanceAgent(options);
        break;
      }
      case AgentType.PERFORMANCE_INSIGHT: {
        agent = new PerformanceInsightsAgent(options);
        break;
      }
      case AgentType.PATCH: {
        throw new Error('AI Assistance does not support direct usage of the patch agent');
      }
    }
    return agent;
  }

  #updateToolbarState(): void {
    this.#deleteHistoryEntryButton.setVisible(Boolean(this.#currentConversation && !this.#currentConversation.isEmpty));
  }

  static async instance(opts: {
    forceNew: boolean|null,
  }|undefined = {forceNew: null}): Promise<AiAssistancePanel> {
    const {forceNew} = opts;
    if (!panelInstance || forceNew) {
      const aidaClient = new Host.AidaClient.AidaClient();
      const syncInfoPromise = new Promise<Host.InspectorFrontendHostAPI.SyncInformation>(
          resolve => Host.InspectorFrontendHost.InspectorFrontendHostInstance.getSyncInformation(resolve));
      const [aidaAvailability, syncInfo] =
          await Promise.all([Host.AidaClient.AidaClient.checkAccessPreconditions(), syncInfoPromise]);
      panelInstance = new AiAssistancePanel(defaultView, {aidaClient, aidaAvailability, syncInfo});
    }

    return panelInstance;
  }

  // We select the default agent based on the open panels if
  // there isn't any active conversation.
  #selectDefaultAgentIfNeeded(): void {
    // If there already is an agent and if it is not empty,
    // we don't automatically change the agent. In addition to this,
    // we don't change the current agent when there is a message in flight.
    if ((this.#currentAgent && !this.#currentAgent.isEmpty) || this.#isLoading) {
      return;
    }

    const {hostConfig} = Root.Runtime;
    const isElementsPanelVisible =
        Boolean(UI.Context.Context.instance().flavor(ElementsPanel.ElementsPanel.ElementsPanel));
    const isNetworkPanelVisible = Boolean(UI.Context.Context.instance().flavor(NetworkPanel.NetworkPanel.NetworkPanel));
    const isSourcesPanelVisible = Boolean(UI.Context.Context.instance().flavor(SourcesPanel.SourcesPanel.SourcesPanel));
    const isPerformancePanelVisible =
        Boolean(UI.Context.Context.instance().flavor(TimelinePanel.TimelinePanel.TimelinePanel));

    let targetAgentType: AgentType|undefined = undefined;
    if (isElementsPanelVisible && hostConfig.devToolsFreestyler?.enabled) {
      targetAgentType = AgentType.STYLING;
    } else if (isNetworkPanelVisible && hostConfig.devToolsAiAssistanceNetworkAgent?.enabled) {
      targetAgentType = AgentType.NETWORK;
    } else if (isSourcesPanelVisible && hostConfig.devToolsAiAssistanceFileAgent?.enabled) {
      targetAgentType = AgentType.FILE;
    } else if (
        isPerformancePanelVisible && hostConfig.devToolsAiAssistancePerformanceAgent?.enabled &&
        hostConfig.devToolsAiAssistancePerformanceAgent?.insightsEnabled) {
      targetAgentType = AgentType.PERFORMANCE_INSIGHT;
    } else if (isPerformancePanelVisible && hostConfig.devToolsAiAssistancePerformanceAgent?.enabled) {
      targetAgentType = AgentType.PERFORMANCE;
    }

    const agent = targetAgentType ? this.#createAgent(targetAgentType) : undefined;
    this.#updateAgentState(agent);
  }

  #updateAgentState(agent?: AiAgent<unknown>): void {
    if (this.#currentAgent !== agent) {
      this.#cancel();
      this.#messages = [];
      this.#isLoading = false;
      this.#currentAgent = agent;
      if (this.#currentAgent?.type) {
        this.#currentConversation =
            new Conversation(agentTypeToConversationType(this.#currentAgent.type), [], agent?.id, false);
        this.#conversations.push(this.#currentConversation);
      }
    }

    this.#onContextSelectionChanged();
    void this.doUpdate();
  }

  override wasShown(): void {
    super.wasShown();
    this.#viewOutput.chatView?.restoreScrollPosition();
    this.#viewOutput.chatView?.focusTextInput();
    this.#selectDefaultAgentIfNeeded();
    void this.#handleAidaAvailabilityChange();
    this.#selectedElement =
        createNodeContext(selectedElementFilter(UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode)));
    this.#selectedRequest =
        createRequestContext(UI.Context.Context.instance().flavor(SDK.NetworkRequest.NetworkRequest));
    this.#selectedCallTree =
        createCallTreeContext(UI.Context.Context.instance().flavor(TimelineUtils.AICallTree.AICallTree));
    this.#selectedPerformanceInsight =
        createPerfInsightContext(UI.Context.Context.instance().flavor(TimelineUtils.InsightAIContext.ActiveInsight));
    this.#selectedFile = createFileContext(UI.Context.Context.instance().flavor(Workspace.UISourceCode.UISourceCode));
    this.#selectedContext = this.#getConversationContext();
    void this.doUpdate();

    this.#aiAssistanceEnabledSetting?.addChangeListener(this.doUpdate, this);
    Host.AidaClient.HostConfigTracker.instance().addEventListener(
        Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED, this.#handleAidaAvailabilityChange);
    this.#toggleSearchElementAction.addEventListener(UI.ActionRegistration.Events.TOGGLED, this.doUpdate, this);

    UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.#handleDOMNodeFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        SDK.NetworkRequest.NetworkRequest, this.#handleNetworkRequestFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        TimelineUtils.AICallTree.AICallTree, this.#handleTraceEntryNodeFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        Workspace.UISourceCode.UISourceCode, this.#handleUISourceCodeFlavorChange);
    UI.Context.Context.instance().addFlavorChangeListener(
        TimelineUtils.InsightAIContext.ActiveInsight, this.#handlePerfInsightFlavorChange);

    UI.Context.Context.instance().addFlavorChangeListener(
        ElementsPanel.ElementsPanel.ElementsPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().addFlavorChangeListener(
        NetworkPanel.NetworkPanel.NetworkPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().addFlavorChangeListener(
        SourcesPanel.SourcesPanel.SourcesPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().addFlavorChangeListener(
        TimelinePanel.TimelinePanel.TimelinePanel, this.#selectDefaultAgentIfNeeded, this);
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.DOMModel.DOMModel, SDK.DOMModel.Events.AttrModified, this.#handleDOMNodeAttrChange, this);
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.DOMModel.DOMModel, SDK.DOMModel.Events.AttrRemoved, this.#handleDOMNodeAttrChange, this);
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistancePanelOpened);
  }

  override willHide(): void {
    this.#aiAssistanceEnabledSetting?.removeChangeListener(this.doUpdate, this);
    Host.AidaClient.HostConfigTracker.instance().removeEventListener(
        Host.AidaClient.Events.AIDA_AVAILABILITY_CHANGED, this.#handleAidaAvailabilityChange);
    this.#toggleSearchElementAction.removeEventListener(UI.ActionRegistration.Events.TOGGLED, this.doUpdate, this);
    UI.Context.Context.instance().removeFlavorChangeListener(SDK.DOMModel.DOMNode, this.#handleDOMNodeFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        SDK.NetworkRequest.NetworkRequest, this.#handleNetworkRequestFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        TimelineUtils.AICallTree.AICallTree, this.#handleTraceEntryNodeFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        TimelineUtils.InsightAIContext.ActiveInsight, this.#handlePerfInsightFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        Workspace.UISourceCode.UISourceCode, this.#handleUISourceCodeFlavorChange);
    UI.Context.Context.instance().removeFlavorChangeListener(
        ElementsPanel.ElementsPanel.ElementsPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().removeFlavorChangeListener(
        NetworkPanel.NetworkPanel.NetworkPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().removeFlavorChangeListener(
        SourcesPanel.SourcesPanel.SourcesPanel, this.#selectDefaultAgentIfNeeded, this);
    UI.Context.Context.instance().removeFlavorChangeListener(
        TimelinePanel.TimelinePanel.TimelinePanel, this.#selectDefaultAgentIfNeeded, this);
    SDK.TargetManager.TargetManager.instance().removeModelListener(
        SDK.DOMModel.DOMModel,
        SDK.DOMModel.Events.AttrModified,
        this.#handleDOMNodeAttrChange,
        this,
    );
    SDK.TargetManager.TargetManager.instance().removeModelListener(
        SDK.DOMModel.DOMModel,
        SDK.DOMModel.Events.AttrRemoved,
        this.#handleDOMNodeAttrChange,
        this,
    );
  }

  #handleAidaAvailabilityChange = async(): Promise<void> => {
    const currentAidaAvailability = await Host.AidaClient.AidaClient.checkAccessPreconditions();
    if (currentAidaAvailability !== this.#aidaAvailability) {
      this.#aidaAvailability = currentAidaAvailability;
      const syncInfo = await new Promise<Host.InspectorFrontendHostAPI.SyncInformation>(
          resolve => Host.InspectorFrontendHost.InspectorFrontendHostInstance.getSyncInformation(resolve));
      this.#userInfo = {
        accountImage: syncInfo.accountImage,
        accountFullName: syncInfo.accountFullName,
      };
      void this.doUpdate();
    }
  };

  #handleDOMNodeFlavorChange = (ev: Common.EventTarget.EventTargetEvent<SDK.DOMModel.DOMNode>): void => {
    if (this.#selectedElement?.getItem() === ev.data) {
      return;
    }

    this.#selectedElement = createNodeContext(selectedElementFilter(ev.data));
    this.#updateAgentState(this.#currentAgent);
  };

  #handleDOMNodeAttrChange =
      (ev: Common.EventTarget.EventTargetEvent<{node: SDK.DOMModel.DOMNode, name: string}>): void => {
        if (this.#selectedElement?.getItem() === ev.data.node) {
          if (ev.data.name === 'class' || ev.data.name === 'id') {
            void this.doUpdate();
          }
        }
      };

  #handleNetworkRequestFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<SDK.NetworkRequest.NetworkRequest>): void => {
        if (this.#selectedRequest?.getItem() === ev.data) {
          return;
        }

        this.#selectedRequest = Boolean(ev.data) ? new RequestContext(ev.data) : null;
        this.#updateAgentState(this.#currentAgent);
      };

  #handleTraceEntryNodeFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<TimelineUtils.AICallTree.AICallTree>): void => {
        if (this.#selectedCallTree?.getItem() === ev.data) {
          return;
        }

        this.#selectedCallTree = Boolean(ev.data) ? new CallTreeContext(ev.data) : null;
        this.#updateAgentState(this.#currentAgent);
      };

  #handlePerfInsightFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<TimelineUtils.InsightAIContext.ActiveInsight>): void => {
        if (this.#selectedPerformanceInsight?.getItem() === ev.data) {
          return;
        }

        this.#selectedPerformanceInsight = Boolean(ev.data) ? new InsightContext(ev.data) : null;
        this.#updateAgentState(this.#currentAgent);
      };

  #handleUISourceCodeFlavorChange =
      (ev: Common.EventTarget.EventTargetEvent<Workspace.UISourceCode.UISourceCode>): void => {
        const newFile = ev.data;
        if (!newFile) {
          return;
        }
        if (this.#selectedFile?.getItem() === newFile) {
          return;
        }
        this.#selectedFile = new FileContext(ev.data);
        this.#updateAgentState(this.#currentAgent);
      };

  #getChangeSummary(): string|undefined {
    return (isAiAssistancePatchingEnabled() && this.#currentAgent && !this.#currentConversation?.isReadOnly) ?
        this.#changeManager.formatChanges(this.#currentAgent.id) :
        undefined;
  }

  async doUpdate(): Promise<void> {
    this.#updateToolbarState();
    this.view(
        {
          state: this.#getChatUiState(),
          blockedByCrossOrigin: this.#blockedByCrossOrigin,
          aidaAvailability: this.#aidaAvailability,
          isLoading: this.#isLoading,
          messages: this.#messages,
          selectedContext: this.#selectedContext,
          agentType: this.#currentAgent?.type,
          isReadOnly: this.#currentConversation?.isReadOnly ?? false,
          changeSummary: this.#getChangeSummary(),
          patchSuggestion: this.#patchSuggestion,
          patchSuggestionLoading: this.#patchSuggestionLoading,
          stripLinks: this.#currentAgent?.type === AgentType.PERFORMANCE,
          inspectElementToggled: this.#toggleSearchElementAction.toggled(),
          userInfo: this.#userInfo,
          canShowFeedbackForm: this.#serverSideLoggingEnabled,
          multimodalInputEnabled:
              isAiAssistanceMultimodalInputEnabled() && this.#currentAgent?.type === AgentType.STYLING,
          imageInput: this.#imageInput,
          onTextSubmit: async (text: string, imageInput?: Host.AidaClient.Part) => {
            this.#imageInput = '';
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceQuerySubmitted);
            await this.#startConversation(text, imageInput);
          },
          onInspectElementClick: this.#handleSelectElementClick.bind(this),
          onFeedbackSubmit: this.#handleFeedbackSubmit.bind(this),
          onCancelClick: this.#cancel.bind(this),
          onContextClick: this.#handleContextClick.bind(this),
          onNewConversation: this.#handleNewChatRequest.bind(this),
          onCancelCrossOriginChat: this.#blockedByCrossOrigin && this.#previousSameOriginContext ?
              this.#handleCrossOriginChatCancellation.bind(this) :
              undefined,
          onTakeScreenshot: isAiAssistanceMultimodalInputEnabled() ? this.#handleTakeScreenshot.bind(this) : undefined,
          onRemoveImageInput: isAiAssistanceMultimodalInputEnabled() ? this.#handleRemoveImageInput.bind(this) :
                                                                       undefined,
          onApplyToWorkspace: this.#onApplyToWorkspace.bind(this)
        },
        this.#viewOutput, this.#contentContainer);
  }

  #handleSelectElementClick(): void {
    void this.#toggleSearchElementAction.execute();
  }

  async #handleFeedbackSubmit(rpcId: Host.AidaClient.RpcGlobalId, rating: Host.AidaClient.Rating, feedback?: string):
      Promise<void> {
    void this.#aidaClient.registerClientEvent({
      corresponding_aida_rpc_global_id: rpcId,
      disable_user_content_logging: !this.#serverSideLoggingEnabled,
      do_conversation_client_event: {
        user_feedback: {
          sentiment: rating,
          user_input: {
            comment: feedback,
          },
        },
      },
    });
  }

  #handleContextClick(): void|Promise<void> {
    const context = this.#selectedContext;
    if (context instanceof RequestContext) {
      const requestLocation = NetworkForward.UIRequestLocation.UIRequestLocation.tab(
          context.getItem(), NetworkForward.UIRequestLocation.UIRequestTabs.HEADERS_COMPONENT);
      return Common.Revealer.reveal(requestLocation);
    }
    if (context instanceof FileContext) {
      return Common.Revealer.reveal(context.getItem().uiLocation(0, 0));
    }
    if (context instanceof CallTreeContext) {
      const trace = new SDK.TraceObject.RevealableEvent(context.getItem().selectedNode.event);
      return Common.Revealer.reveal(trace);
    }
    // Node picker is using linkifier.
  }

  handleAction(actionId: string): void {
    if (this.#isLoading) {
      // If running some queries already, focus the input with the abort
      // button and do nothing.
      this.#viewOutput.chatView?.focusTextInput();
      return;
    }

    let targetAgentType: AgentType|undefined;
    switch (actionId) {
      case 'freestyler.elements-floating-button': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromElementsPanelFloatingButton);
        targetAgentType = AgentType.STYLING;
        break;
      }
      case 'freestyler.element-panel-context': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromElementsPanel);
        targetAgentType = AgentType.STYLING;
        break;
      }
      case 'drjones.network-floating-button': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromNetworkPanelFloatingButton);
        targetAgentType = AgentType.NETWORK;
        break;
      }
      case 'drjones.network-panel-context': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromNetworkPanel);
        targetAgentType = AgentType.NETWORK;
        break;
      }
      case 'drjones.performance-panel-context': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromPerformancePanel);
        targetAgentType = AgentType.PERFORMANCE;
        break;
      }
      case 'drjones.performance-insight-context': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromPerformanceInsight);
        targetAgentType = AgentType.PERFORMANCE_INSIGHT;
        break;
      }
      case 'drjones.sources-floating-button': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromSourcesPanelFloatingButton);
        targetAgentType = AgentType.FILE;
        break;
      }
      case 'drjones.sources-panel-context': {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceOpenedFromSourcesPanel);
        targetAgentType = AgentType.FILE;
        break;
      }
    }

    if (!targetAgentType) {
      return;
    }

    let agent = this.#currentAgent;
    if (!this.#currentConversation || !this.#currentAgent || this.#currentAgent.type !== targetAgentType ||
        this.#currentConversation?.isEmpty || targetAgentType === AgentType.PERFORMANCE) {
      agent = this.#createAgent(targetAgentType);
    }
    this.#updateAgentState(agent);
    this.#viewOutput.chatView?.focusTextInput();
  }

  #onHistoryClicked(event: Event): void {
    const boundingRect = this.#historyEntriesButton.element.getBoundingClientRect();
    const contextMenu = new UI.ContextMenu.ContextMenu(event, {
      x: boundingRect.left,
      y: boundingRect.bottom,
      useSoftMenu: true,
    });

    for (const conversation of [...this.#conversations].reverse()) {
      if (conversation.isEmpty) {
        continue;
      }
      const title = conversation.title;
      if (!title) {
        continue;
      }

      contextMenu.defaultSection().appendCheckboxItem(title, () => {
        void this.#openConversation(conversation);
      }, {checked: (this.#currentConversation === conversation)});
    }

    const historyEmpty = contextMenu.defaultSection().items.length === 0;
    if (historyEmpty) {
      contextMenu.defaultSection().appendItem(i18nString(UIStrings.noPastConversations), () => {}, {
        disabled: true,
      });
    }

    contextMenu.footerSection().appendItem(
        i18nString(UIStrings.clearChatHistory),
        () => {
          this.#clearHistory();
        },
        {
          disabled: historyEmpty,
        },
    );

    void contextMenu.show();
  }

  #clearHistory(): void {
    this.#conversations = [];
    this.#currentConversation = undefined;
    void AiHistoryStorage.instance().deleteAll();
    this.#updateAgentState();
  }

  #onDeleteClicked(): void {
    if (this.#currentAgent) {
      this.#conversations = this.#conversations.filter(conversation => conversation !== this.#currentConversation);
      this.#currentConversation = undefined;
      void AiHistoryStorage.instance().deleteHistoryEntry(this.#currentAgent.id);
    }
    this.#updateAgentState();
    this.#selectDefaultAgentIfNeeded();
    UI.ARIAUtils.alert(i18nString(UIStrings.chatDeleted));
  }

  async #openConversation(conversation: Conversation): Promise<void> {
    if (this.#currentConversation === conversation) {
      return;
    }
    this.#currentConversation = conversation;
    this.#messages = [];
    await this.#doConversation(conversation.history);
  }

  #handleNewChatRequest(): void {
    this.#updateAgentState();
    this.#selectDefaultAgentIfNeeded();
    UI.ARIAUtils.alert(i18nString(UIStrings.newChatCreated));
  }

  #handleCrossOriginChatCancellation(): void {
    if (this.#previousSameOriginContext) {
      this.#onContextSelectionChanged(this.#previousSameOriginContext);
      void this.doUpdate();
    }
  }

  async #handleTakeScreenshot(): Promise<void> {
    const mainTarget = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
    if (!mainTarget) {
      throw new Error('Could not find main target');
    }
    const model = mainTarget.model(SDK.ScreenCaptureModel.ScreenCaptureModel);
    if (!model) {
      throw new Error('Could not find model');
    }
    const bytes = await model.captureScreenshot(
        Protocol.Page.CaptureScreenshotRequestFormat.Jpeg,
        SCREENSHOT_QUALITY,
        SDK.ScreenCaptureModel.ScreenshotMode.FROM_VIEWPORT,
    );
    if (bytes) {
      this.#imageInput = bytes;
      void this.doUpdate();
    }
  }

  #handleRemoveImageInput(): void {
    this.#imageInput = '';
    void this.doUpdate();
  }

  #runAbortController = new AbortController();
  #cancel(): void {
    this.#runAbortController.abort();
    this.#isLoading = false;
    void this.doUpdate();
  }

  #onContextSelectionChanged(contextToRestore?: ConversationContext<unknown>): void {
    if (!this.#currentAgent) {
      this.#blockedByCrossOrigin = false;
      return;
    }
    const currentContext = contextToRestore ?? this.#getConversationContext();
    this.#selectedContext = currentContext;
    if (!currentContext) {
      this.#blockedByCrossOrigin = false;
      return;
    }
    this.#blockedByCrossOrigin = !currentContext.isOriginAllowed(this.#currentAgent.origin);
    if (!this.#blockedByCrossOrigin) {
      this.#previousSameOriginContext = currentContext;
    }
  }

  #getConversationContext(): ConversationContext<unknown>|null {
    if (!this.#currentAgent) {
      return null;
    }
    let context: ConversationContext<unknown>|null;
    switch (this.#currentAgent.type) {
      case AgentType.STYLING:
        context = this.#selectedElement;
        break;
      case AgentType.FILE:
        context = this.#selectedFile;
        break;
      case AgentType.NETWORK:
        context = this.#selectedRequest;
        break;
      case AgentType.PERFORMANCE:
        context = this.#selectedCallTree;
        break;
      case AgentType.PERFORMANCE_INSIGHT:
        context = this.#selectedPerformanceInsight;
        break;
      case AgentType.PATCH:
        throw new Error('AI Assistance does not support direct usage of the patch agent');
    }
    return context;
  }

  async #startConversation(text: string, imageInput?: Host.AidaClient.Part): Promise<void> {
    if (!this.#currentAgent) {
      return;
    }
    // Cancel any previous in-flight conversation.
    this.#cancel();
    this.#runAbortController = new AbortController();
    const signal = this.#runAbortController.signal;
    const context = this.#getConversationContext();
    // If a different context is provided, it must be from the same origin.
    if (context && !context.isOriginAllowed(this.#currentAgent.origin)) {
      // This error should not be reached. If it happens, some
      // invariants do not hold anymore.
      throw new Error('cross-origin context data should not be included');
    }

    const runner = this.#currentAgent.run(
        text, {
          signal,
          selected: context,
        },
        isAiAssistanceMultimodalInputEnabled() ? imageInput : undefined);
    UI.ARIAUtils.alert(lockedString(UIStringsNotTranslate.answerLoading));
    await this.#doConversation(this.#saveResponsesToCurrentConversation(runner));
    UI.ARIAUtils.alert(lockedString(UIStringsNotTranslate.answerReady));
  }

  async #onApplyToWorkspace(): Promise<void> {
    if (!this.#project) {
      throw new Error('Project does not exist');
    }
    const agent = new PatchAgent({
      aidaClient: this.#aidaClient,
      serverSideLoggingEnabled: this.#serverSideLoggingEnabled,
    });
    this.#patchSuggestionLoading = true;
    void this.doUpdate();
    const prompt =
        `I have applied the following CSS changes to my page in Chrome DevTools, what are the files in my source code that I need to change to apply the same change?

\`\`\`css
${this.#getChangeSummary()}
\`\`\`

Try searching using the selectors and if nothing matches, try to find a semantically appropriate place to change.
Output one filename per line and nothing else!
`;

    let response;
    for await (response of agent.run(prompt, {
      selected: new ProjectContext(this.#project),
    })) {
    }
    this.#patchSuggestion = response?.type === ResponseType.ANSWER ? response.text : 'Could not find files';
    this.#patchSuggestionLoading = false;
    void this.doUpdate();
  }

  async *
      #saveResponsesToCurrentConversation(items: AsyncIterable<ResponseData, void, void>):
          AsyncGenerator<ResponseData, void, void> {
    for await (const data of items) {
      this.#currentConversation?.addHistoryItem(data);
      yield data;
    }
  }

  async #doConversation(items: Iterable<ResponseData, void, void>|AsyncIterable<ResponseData, void, void>):
      Promise<void> {
    const release = await this.#mutex.acquire();
    try {
      let systemMessage: ModelChatMessage = {
        entity: ChatMessageEntity.MODEL,
        steps: [],
      };
      let step: Step = {isLoading: true};

      /**
       * Commits the step to props only if necessary.
       */
      function commitStep(): void {
        if (systemMessage.steps.at(-1) !== step) {
          systemMessage.steps.push(step);
        }
      }

      this.#isLoading = true;
      for await (const data of items) {
        step.sideEffect = undefined;
        switch (data.type) {
          case ResponseType.USER_QUERY: {
            this.#messages.push({
              entity: ChatMessageEntity.USER,
              text: data.query,
              imageInput: data.imageInput,
            });
            systemMessage = {
              entity: ChatMessageEntity.MODEL,
              steps: [],
            };
            this.#messages.push(systemMessage);
            break;
          }
          case ResponseType.QUERYING: {
            step = {isLoading: true};
            if (!systemMessage.steps.length) {
              systemMessage.steps.push(step);
            }

            break;
          }
          case ResponseType.CONTEXT: {
            step.title = data.title;
            step.contextDetails = data.details;
            step.isLoading = false;
            commitStep();
            break;
          }
          case ResponseType.TITLE: {
            step.title = data.title;
            commitStep();
            break;
          }
          case ResponseType.THOUGHT: {
            step.isLoading = false;
            step.thought = data.thought;
            commitStep();
            break;
          }
          case ResponseType.SUGGESTIONS: {
            systemMessage.suggestions = data.suggestions;
            break;
          }
          case ResponseType.SIDE_EFFECT: {
            step.isLoading = false;
            step.code ??= data.code;
            step.sideEffect = {
              onAnswer: (result: boolean) => {
                data.confirm(result);
                step.sideEffect = undefined;
                void this.doUpdate();
              },
            };
            commitStep();
            break;
          }
          case ResponseType.ACTION: {
            step.isLoading = false;
            step.code ??= data.code;
            step.output ??= data.output;
            step.canceled = data.canceled;
            commitStep();
            break;
          }
          case ResponseType.ANSWER: {
            systemMessage.suggestions ??= data.suggestions;
            systemMessage.answer = data.text;
            systemMessage.rpcId = data.rpcId;
            // When there is an answer without any thinking steps, we don't want to show the thinking step.
            if (systemMessage.steps.length === 1 && systemMessage.steps[0].isLoading) {
              systemMessage.steps.pop();
            }
            step.isLoading = false;
            break;
          }
          case ResponseType.ERROR: {
            systemMessage.error = data.error;
            systemMessage.rpcId = undefined;
            const lastStep = systemMessage.steps.at(-1);
            if (lastStep) {
              // Mark the last step as cancelled to make the UI feel better.
              if (data.error === ErrorType.ABORT) {
                lastStep.canceled = true;
                // If error happens while the step is still loading remove it.
              } else if (lastStep.isLoading) {
                systemMessage.steps.pop();
              }
            }
            if (data.error === ErrorType.BLOCK) {
              systemMessage.answer = undefined;
            }
          }
        }

        // Commit update intermediated step when not
        // in read only mode.
        if (!this.#currentConversation?.isReadOnly) {
          void this.doUpdate();

          // This handles scrolling to the bottom for live conversations when:
          // * User submits the query & the context step is shown.
          // * There is a side effect dialog  shown.
          if (data.type === ResponseType.CONTEXT || data.type === ResponseType.SIDE_EFFECT) {
            this.#viewOutput.chatView?.scrollToBottom();
          }
        }
      }

      this.#isLoading = false;
      this.#viewOutput.chatView?.finishTextAnimations();
      void this.doUpdate();
    } finally {
      release();
    }
  }
}

export class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
  handleAction(
      _context: UI.Context.Context,
      actionId: string,
      ): boolean {
    switch (actionId) {
      case 'freestyler.elements-floating-button':
      case 'freestyler.element-panel-context':
      case 'drjones.network-floating-button':
      case 'drjones.network-panel-context':
      case 'drjones.performance-panel-context':
      case 'drjones.performance-insight-context':
      case 'drjones.sources-floating-button':
      case 'drjones.sources-panel-context': {
        void (async () => {
          const view = UI.ViewManager.ViewManager.instance().view(
              AiAssistancePanel.panelName,
          );

          if (view) {
            await UI.ViewManager.ViewManager.instance().showView(
                AiAssistancePanel.panelName,
            );
            const widget = (await view.widget()) as AiAssistancePanel;
            widget.handleAction(actionId);
          }
        })();
        return true;
      }
    }

    return false;
  }
}

function isAiAssistanceMultimodalInputEnabled(): boolean {
  const {hostConfig} = Root.Runtime;
  return Boolean(hostConfig.devToolsFreestyler?.multimodal);
}

function isAiAssistancePatchingEnabled(): boolean {
  const {hostConfig} = Root.Runtime;
  return Boolean(hostConfig.devToolsFreestyler?.patching);
}

function isAiAssistanceServerSideLoggingEnabled(): boolean {
  const {hostConfig} = Root.Runtime;
  return !hostConfig.aidaAvailability?.disallowLogging;
}

function isAiAssistanceStylingWithFunctionCallingEnabled(): boolean {
  const {hostConfig} = Root.Runtime;
  return Boolean(hostConfig.devToolsFreestyler?.functionCalling);
}
