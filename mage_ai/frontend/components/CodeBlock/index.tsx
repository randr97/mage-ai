import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ThemeContext } from 'styled-components';
import { useMutation } from 'react-query';

import AddNewBlocks from '@components/PipelineDetail/AddNewBlocks';
import AutocompleteItemType from '@interfaces/AutocompleteItemType';
import BlockType, {
  BlockLanguageEnum,
  BlockRequestPayloadType,
  BlockTypeEnum,
  SetEditingBlockType,
} from '@interfaces/BlockType';
import Button from '@oracle/elements/Button';
import Circle from '@oracle/elements/Circle';
import CodeEditor, {
  CodeEditorSharedProps,
  OnDidChangeCursorPositionParameterType,
} from '@components/CodeEditor';
import CodeOutput from './CodeOutput';
import CommandButtons, { CommandButtonsSharedProps } from './CommandButtons';
import DataProviderType from '@interfaces/DataProviderType';
import Flex from '@oracle/components/Flex';
import FlexContainer from '@oracle/components/FlexContainer';
import FlyoutMenuWrapper from '@oracle/components/FlyoutMenu/FlyoutMenuWrapper';
import KernelOutputType, {
  DataTypeEnum,
  ExecutionStateEnum,
} from '@interfaces/KernelOutputType';
import LabelWithValueClicker from '@oracle/components/LabelWithValueClicker';
import Link from '@oracle/elements/Link';
import PipelineType from '@interfaces/PipelineType';
import Select from '@oracle/elements/Inputs/Select';
import Spacing from '@oracle/elements/Spacing';
import Text from '@oracle/elements/Text';
import TextInput from '@oracle/elements/Inputs/TextInput';
import Tooltip from '@oracle/components/Tooltip';
import api from '@api';
import buildAutocompleteProvider from '@components/CodeEditor/autocomplete';
import usePrevious from '@utils/usePrevious';
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  FileFill,
  Stack,
} from '@oracle/icons';
import {
  BlockDivider,
  BlockDividerInner,
  CodeHelperStyle,
  TimeTrackerStyle,
} from './index.style';
import {
  CONFIG_KEY_DATA_PROVIDER,
  CONFIG_KEY_DATA_PROVIDER_DATABASE,
  CONFIG_KEY_DATA_PROVIDER_PROFILE,
  CONFIG_KEY_DATA_PROVIDER_SCHEMA,
} from '@interfaces/ChartBlockType';
import {
  ContainerStyle,
  CodeContainerStyle,
  getColorsForBlockType,
} from './index.style';
import { DataSourceTypeEnum } from '@interfaces/DataSourceType';
import {
  KEY_CODE_CONTROL,
  KEY_CODE_ENTER,
  KEY_CODE_META,
  KEY_CODE_SHIFT,
} from '@utils/hooks/keyboardShortcuts/constants';
import { PADDING_UNITS, UNIT } from '@oracle/styles/units/spacing';
import { SINGLE_LINE_HEIGHT } from '@components/CodeEditor/index.style';
import { ViewKeyEnum } from '@components/Sidekick/constants';
import { buildConvertBlockMenuItems, getUpstreamBlockUuids } from './utils';
import { executeCode } from '@components/CodeEditor/keyboard_shortcuts/shortcuts';
import { get, set } from '@storage/localStorage';
import { indexBy } from '@utils/array';
import { onError, onSuccess } from '@api/utils/response';
import { onlyKeysPresent } from '@utils/hooks/keyboardShortcuts/utils';
import { pluralize } from '@utils/string';
import { useKeyboardContext } from '@context/Keyboard';
import { initializeContentAndMessages } from '@components/PipelineDetail/utils';

type CodeBlockProps = {
  addNewBlock: (block: BlockType) => Promise<any>;
  addNewBlockMenuOpenIdx: number;
  autocompleteItems: AutocompleteItemType[];
  block: BlockType;
  blockRefs: any;
  blockIdx: number;
  blocks: BlockType[];
  dataProviders: DataProviderType[];
  defaultValue?: string;
  executionState: ExecutionStateEnum;
  fetchFileTree: () => void;
  fetchPipeline: () => void;
  mainContainerRef?: any;
  mainContainerWidth: number;
  messages: KernelOutputType[];
  noDivider?: boolean;
  onChange?: (value: string) => void;
  openSidekickView: (newView: ViewKeyEnum, pushHistory?: boolean) => void;
  pipeline: PipelineType;
  runBlock: (payload: {
    block: BlockType;
    code: string;
    runDownstream?: boolean;
    runUpstream?: boolean;
    runTests?: boolean;
  }) => void;
  runningBlocks: BlockType[];
  savePipelineContent: (payload?: {
    block?: BlockType;
    pipeline?: PipelineType;
  }) => Promise<any>;
  setAddNewBlockMenuOpenIdx?: (cb: any) => void;
  setAnyInputFocused: (value: boolean) => void;
  setOutputBlocks: (func: (prevOutputBlocks: BlockType[]) => BlockType[]) => void;
  setRecsWindowOpenBlockIdx: (idx: number) => void;
  setSelectedOutputBlock: (block: BlockType) => void;
  widgets: BlockType[];
} & CodeEditorSharedProps & CommandButtonsSharedProps & SetEditingBlockType;

function CodeBlockProps({
  addNewBlock,
  addNewBlockMenuOpenIdx,
  addWidget,
  autocompleteItems,
  block,
  blockIdx,
  blockRefs,
  blocks,
  dataProviders,
  defaultValue = '',
  deleteBlock,
  executionState,
  fetchFileTree,
  fetchPipeline,
  height,
  interruptKernel,
  mainContainerRef,
  mainContainerWidth,
  messages: blockMessages = [],
  noDivider,
  onChange,
  openSidekickView,
  pipeline,
  runBlock,
  runningBlocks,
  savePipelineContent,
  selected,
  setAddNewBlockMenuOpenIdx,
  setAnyInputFocused,
  setEditingBlock,
  setOutputBlocks,
  setRecsWindowOpenBlockIdx,
  setSelected,
  setSelectedOutputBlock,
  setTextareaFocused,
  textareaFocused,
  widgets,
}: CodeBlockProps, ref) {
  const themeContext = useContext(ThemeContext);

  const [addNewBlocksVisible, setAddNewBlocksVisible] = useState(false);
  const [autocompleteProviders, setAutocompleteProviders] = useState(null);
  const [blockMenuVisible, setBlockMenuVisible] = useState(false);
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [content, setContent] = useState(defaultValue);
  const [currentTime, setCurrentTime] = useState<number>(null);
  const [dataProviderConfig, setDataProviderConfig] = useState({
    [CONFIG_KEY_DATA_PROVIDER]: block?.configuration?.[CONFIG_KEY_DATA_PROVIDER],
    [CONFIG_KEY_DATA_PROVIDER_DATABASE]: block?.configuration?.[CONFIG_KEY_DATA_PROVIDER_DATABASE],
    [CONFIG_KEY_DATA_PROVIDER_PROFILE]: block?.configuration?.[CONFIG_KEY_DATA_PROVIDER_PROFILE],
    [CONFIG_KEY_DATA_PROVIDER_SCHEMA]: block?.configuration?.[CONFIG_KEY_DATA_PROVIDER_SCHEMA],
  });
  const [errorMessages, setErrorMessages] = useState(null);
  const [isEditingBlock, setIsEditingBlock] = useState(false);
  const [newBlockUuid, setNewBlockUuid] = useState(block.uuid);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [runCount, setRunCount] = useState<number>(0);
  const [runEndTime, setRunEndTime] = useState<number>(null);
  const [runStartTime, setRunStartTime] = useState<number>(null);
  const [messages, setMessages] = useState<KernelOutputType[]>(blockMessages);

  const blockPrevious = usePrevious(block);
  useEffect(() => {
    if (JSON.stringify(block) != JSON.stringify(blockPrevious)) {
      const {
        messages: messagesInit,
      } = initializeContentAndMessages([block]);
      const msgs = messagesInit?.[block?.uuid];
      if (msgs?.length >= 1) {
        setMessages(msgs);
      }
    }
  },
  [
    block,
    blockPrevious,
    setMessages,
  ]);

  const blockMessagesPrev = usePrevious(blockMessages);
  useEffect(() => {
    if (typeof blockMessages !== 'undefined'
        && blockMessages.length !== blockMessagesPrev?.length) {

      setMessages(blockMessages);
    }
  }, [blockMessages, blockMessagesPrev, setMessages]);

  const dataProviderProfiles = useMemo(() => {
    let set = new Set();
    dataProviders?.forEach(({ profiles }) => {
      // @ts-ignore
      set = new Set([...set, ...profiles]);
    });

    // @ts-ignore
    return [...set];
  }, [
    dataProviders,
  ]);

  const codeCollapsedUUID = useMemo(() => (
    `${pipeline?.uuid}/${block?.uuid}/codeCollapsed`
  ), [pipeline?.uuid, block?.uuid]);

  const outputCollapsedUUID = useMemo(() => (
    `${pipeline?.uuid}/${block?.uuid}/outputCollapsed`
  ), [pipeline?.uuid, block?.uuid]);

  useEffect(() => {
    setCodeCollapsed(get(codeCollapsedUUID, false));
    setOutputCollapsed(get(outputCollapsedUUID, false));
  }, []);

  const blockMenuRef = useRef(null);
  const blocksMapping = useMemo(() => indexBy(blocks, ({ uuid }) => uuid), [blocks]);

  const hasDownstreamWidgets = useMemo(() => !!widgets.find(({
    upstream_blocks: upstreamBlocks,
  }: BlockType) => upstreamBlocks.includes(block.uuid)), [
    block,
    widgets,
  ]);

  const runBlockAndTrack = useCallback(
    (payload?: {
      block: BlockType;
      code?: string;
      disableReset?: boolean;
      runDownstream?: boolean;
      runUpstream?: boolean;
      runTests?: boolean;
    }) => {
      const {
        block: blockPayload,
        code,
        disableReset,
        runDownstream,
        runUpstream,
        runTests,
      } = payload || {};
      runBlock({
        block: blockPayload,
        code: code || content,
        runDownstream: runDownstream || hasDownstreamWidgets,
        runUpstream: runUpstream || false,
        runTests: runTests || false,
      });

      if (!disableReset) {
        setRunCount(1 + Number(runCount));
        setRunEndTime(null);
        setOutputCollapsed(false);
      }
    }, [
      content,
      hasDownstreamWidgets,
      runCount,
      runBlock,
      setRunCount,
      setRunEndTime,
    ]);

  const isInProgress = !!runningBlocks.find(({ uuid }) => uuid === block.uuid)
    || messages?.length >= 1 && executionState !== ExecutionStateEnum.IDLE;

  useEffect(() => {
    if (isInProgress) {
      setRunStartTime(Number(new Date()));
    }
  }, [
    isInProgress,
    setRunStartTime,
  ]);

  const finalExecutionStatePrevious = usePrevious(executionState);
  useEffect(() => {
    if (executionState === ExecutionStateEnum.IDLE
      && executionState !== finalExecutionStatePrevious
    ) {
      setRunEndTime(Number(new Date()));
    }
  }, [
    executionState,
    finalExecutionStatePrevious,
    setRunEndTime,
  ]);

  const onDidChangeCursorPosition = useCallback(({
    editorRect: {
      height,
      top,
    },
    position: {
      lineNumber,
    },
  }: OnDidChangeCursorPositionParameterType) => {
    if (mainContainerRef?.current) {
      const {
        height: mainContainerHeight,
      } = mainContainerRef.current.getBoundingClientRect();

      const heightAtLineNumber = lineNumber * SINGLE_LINE_HEIGHT;

      if (top + heightAtLineNumber > mainContainerHeight) {
        const newY = mainContainerRef.current.scrollTop
          + ((heightAtLineNumber - mainContainerHeight) + top);

        mainContainerRef.current.scrollTo(0, newY);
      } else if (heightAtLineNumber + top < SINGLE_LINE_HEIGHT) {
        const newY = mainContainerRef.current.scrollTop
          + ((heightAtLineNumber + top) - SINGLE_LINE_HEIGHT);
        mainContainerRef.current.scrollTo(0, newY);
      }
    }
  }, [
    mainContainerRef,
  ]);

  const messagesWithType = useMemo(() => {
    if (errorMessages?.length >= 0) {
      return errorMessages.map((errorMessage: string) => ({
        data: errorMessage,
        execution_state: ExecutionStateEnum.IDLE,
        type: DataTypeEnum.TEXT_PLAIN,
      }));
    }
    return messages.filter((kernelOutput: KernelOutputType) => kernelOutput?.type);
  }, [
    errorMessages,
    messages,
  ]);
  const hasError = !!messagesWithType.find(({ error }) => error);

  const color = getColorsForBlockType(block.type, { theme: themeContext }).accent;
  const numberOfParentBlocks = block?.upstream_blocks?.length || 0;
  const borderColorShareProps = useMemo(() => ({
    blockType: block.type,
    hasError,
    selected,
  }), [
    block.type,
    hasError,
    selected,
  ]);
  const hasOutput = messagesWithType.length >= 1;
  const onClickSelectBlock = useCallback(() => {
    if (!selected) {
      setAnyInputFocused(false);
      setSelected(true);
    }
  }, [
    setAnyInputFocused,
    setSelected,
  ]);

  const [updateBlock] = useMutation(
    api.blocks.pipelines.useUpdate(pipeline?.uuid, block.uuid),
    {
      onSuccess: (response: any) => onSuccess(
        response, {
          callback: () => {
            setIsEditingBlock(false);
            fetchPipeline();
            fetchFileTree();
            setContent(content);
          },
          onErrorCallback: ({
            error: {
              errors,
              message,
            },
          }) => {
            console.log(errors, message);
          },
        },
      ),
      onError: (response: any) => {
        const {
          messages,
        } = onError(response);
        setErrorMessages(messages);
      },
    },
  );

  const uuidKeyboard = `CodeBlock/${block.uuid}`;
  const {
    registerOnKeyDown,
    unregisterOnKeyDown,
  } = useKeyboardContext();

  useEffect(() => () => {
    unregisterOnKeyDown(uuidKeyboard);
  }, [unregisterOnKeyDown, uuidKeyboard]);

  registerOnKeyDown(
    uuidKeyboard,
    (event, keyMapping, keyHistory) => {
      if (isEditingBlock
        && String(keyHistory[0]) === String(KEY_CODE_ENTER)
        && String(keyHistory[1]) !== String(KEY_CODE_META)
      ) {
        if (block.uuid === newBlockUuid) {
          event.target.blur();
        } else {
          // @ts-ignore
          updateBlock({
            block: {
              ...block,
              name: newBlockUuid,
            },
          });
        }
      } else if (selected) {
        if (onlyKeysPresent([KEY_CODE_META, KEY_CODE_ENTER], keyMapping)
          || onlyKeysPresent([KEY_CODE_CONTROL, KEY_CODE_ENTER], keyMapping)
        ) {
          runBlockAndTrack({ block });
        } else if (onlyKeysPresent([KEY_CODE_SHIFT, KEY_CODE_ENTER], keyMapping)) {
          event.preventDefault();
          addNewBlock({
            language: block.language,
            type: block.type,
            upstream_blocks: [block.uuid],
          });
          runBlockAndTrack({ block });
        }
      }
    },
    [
      addNewBlock,
      block,
      isEditingBlock,
      newBlockUuid,
      runBlockAndTrack,
      selected,
      updateBlock,
    ],
  );

  useEffect(() => {
    let interval;

    if (runStartTime) {
      interval = setInterval(() => setCurrentTime(Number(new Date())), 1000);
    }

    return () => clearInterval(interval);
  }, [runStartTime]);


  const buildBlockMenu = useCallback((b: BlockType) => {
    const blockMenuItems = {
      [BlockTypeEnum.SCRATCHPAD]: [
        ...buildConvertBlockMenuItems(b, blocks, 'block_menu/scratchpad', addNewBlock),
      ].map((config) => ({
        ...config,
        onClick: () => savePipelineContent().then(() => config.onClick()),
      })),
    };

    return blockMenuItems[b.type];
  }, [
    addNewBlock,
    blocks,
    buildConvertBlockMenuItems,
    savePipelineContent,
  ]);

  const codeEditorEl = useMemo(() => (
    <CodeEditor
      autoHeight
      autocompleteProviders={autocompleteProviders}
      height={height}
      language={block.language}
      onChange={(val: string) => {
        setContent(val);
        onChange?.(val);
      }}
      onDidChangeCursorPosition={onDidChangeCursorPosition}
      placeholder="Start typing here..."
      selected={selected}
      setSelected={setSelected}
      setTextareaFocused={setTextareaFocused}
      shortcuts={[
        (monaco, editor) => executeCode(monaco, () => {
          runBlockAndTrack({
            block,
            code: editor.getValue(),
          });
        }),
      ]}
      textareaFocused={textareaFocused}
      value={content}
      width="100%"
    />
  ), [
    autocompleteProviders,
    block,
    blocks,
    content,
    height,
    pipeline,
    selected,
    textareaFocused,
  ]);

  useEffect(() => {
    setAutocompleteProviders({
      python: buildAutocompleteProvider({
        autocompleteItems,
        block,
        blocks,
        pipeline,
      }),
    });
  }, [
    autocompleteItems,
    block,
    blocks,
    pipeline,
  ]);

  const codeOutputEl = useMemo(() => (
    <CodeOutput
      {...borderColorShareProps}
      block={block}
      collapsed={outputCollapsed}
      isInProgress={isInProgress}
      mainContainerWidth={mainContainerWidth}
      messages={messagesWithType}
      openSidekickView={openSidekickView}
      pipeline={pipeline}
      runCount={runCount}
      runEndTime={runEndTime}
      runStartTime={runStartTime}
      selected={selected}
      setCollapsed={(val: boolean) => {
        setOutputCollapsed(() => {
          set(outputCollapsedUUID, val);
          return val;
        });
      }}
      setOutputBlocks={setOutputBlocks}
      setSelectedOutputBlock={setSelectedOutputBlock}
    />
  ), [
    block,
    borderColorShareProps,
    isInProgress,
    mainContainerWidth,
    messagesWithType,
    outputCollapsed,
    runCount,
    runEndTime,
    runStartTime,
    selected,
  ]);

  const closeBlockMenu = useCallback(() => setBlockMenuVisible(false), []);

  const updateDataProviderConfig = useCallback((payload) => {
    setDataProviderConfig((dataProviderConfigPrev) => {
      const data = {
        ...dataProviderConfigPrev,
        ...payload,
      };

      if (data[CONFIG_KEY_DATA_PROVIDER] && data[CONFIG_KEY_DATA_PROVIDER_PROFILE]) {
        savePipelineContent({
          block: {
            configuration: data,
            uuid: block.uuid,
          },
        });
      }

      return data;
    });
  }, [
    block,
    savePipelineContent,
  ]);

  return (
    <div ref={ref} style={{
      position: 'relative',
      zIndex: blockIdx === addNewBlockMenuOpenIdx ? 11 : null,
    }}>
      <FlexContainer
        alignItems="center"
        justifyContent="space-between"
        style={{
          marginBottom: UNIT / 2,
        }}
      >
        <Flex alignItems="center" flex={1}>
          <FlexContainer alignItems="center">
            <Circle
              color={color}
              size={UNIT * 1.5}
              square
            />

            <Spacing mr={1} />

            <FlyoutMenuWrapper
              items={buildBlockMenu(block)}
              onClickCallback={closeBlockMenu}
              onClickOutside={closeBlockMenu}
              open={blockMenuVisible}
              parentRef={blockMenuRef}
              uuid="CodeBlock/block_menu"
            >
              <Text
                color={color}
                monospace
              >
                {BlockTypeEnum.DATA_EXPORTER === block.type && (
                  <>
                    DATA EXPORTER
                  </>
                )}
                {BlockTypeEnum.DATA_LOADER === block.type && (
                  <>
                    DATA LOADER&nbsp;
                  </>
                )}
                {BlockTypeEnum.SCRATCHPAD === block.type && (
                  <>
                    SCRATCHPAD&nbsp;
                  </>
                )}
                {BlockTypeEnum.TRANSFORMER === block.type && (
                  <>
                    TRANSFORMER&nbsp;
                  </>
                )}
              </Text>
            </FlyoutMenuWrapper>

            {BlockTypeEnum.SCRATCHPAD === block.type && (
              <Button
                basic
                iconOnly
                noPadding
                onClick={() => setBlockMenuVisible(true)}
                transparent
              >
                <ArrowDown muted />
              </Button>
            )}

            <Spacing mr={1} />
          </FlexContainer>

          <Spacing mr={PADDING_UNITS} />

          <FileFill size={UNIT * 1.5} />

          <Spacing mr={1} />

          <FlexContainer alignItems="center">
            <LabelWithValueClicker
              bold={false}
              inputValue={newBlockUuid}
              monospace
              muted
              notRequired
              onBlur={() => setTimeout(() => {
                setAnyInputFocused(false);
                setIsEditingBlock(false);
              }, 300)}
              onChange={(e) => {
                setNewBlockUuid(e.target.value);
                e.preventDefault();
              }}
              onClick={() => {
                setAnyInputFocused(true);
                setIsEditingBlock(true);
              }}
              onFocus={() => {
                setAnyInputFocused(true);
                setIsEditingBlock(true);
              }}
              stacked
              value={!isEditingBlock && block.uuid}
            />

            {isEditingBlock && (
              <>
                <Spacing ml={1} />
                <Link
                  // @ts-ignore
                  onClick={() => savePipelineContent({
                    block: {
                      name: newBlockUuid,
                      uuid: block.uuid,
                    },
                  }).then(() => {
                    setIsEditingBlock(false);
                    fetchPipeline();
                    fetchFileTree();
                  })}
                  preventDefault
                  sameColorAsText
                  small
                >
                  Update name
                </Link>
              </>
            )}
          </FlexContainer>
        </Flex>

        {BlockTypeEnum.DATA_LOADER !== block.type && BlockTypeEnum.SCRATCHPAD !== block.type && (
          <FlexContainer alignItems="center">
            <Tooltip
              appearBefore
              block
              label={`
                ${pluralize('parent block', numberOfParentBlocks)}. ${numberOfParentBlocks === 0 ? 'Click to select 1 or more blocks to depend on.' : 'Edit parent blocks.'}
              `}
              size={null}
              widthFitContent
            >
              <Button
                noBackground
                noBorder
                noPadding
                onClick={() => {
                  setSelected(true);
                  setEditingBlock({
                    upstreamBlocks: {
                      block,
                      values: block.upstream_blocks?.map(uuid => ({ uuid })),
                    },
                  });
                }}
                >
                <FlexContainer alignItems="center">
                  <Text
                    monospace={numberOfParentBlocks >= 1}
                    underline={numberOfParentBlocks === 0}
                    >
                    {numberOfParentBlocks === 0 && 'Click to set parent blocks'}
                    {numberOfParentBlocks >= 1 && pluralize('parent block', numberOfParentBlocks)}
                  </Text>

                  <Spacing mr={1} />

                  <Stack size={UNIT * 2} />
                </FlexContainer>
              </Button>
            </Tooltip>
          </FlexContainer>
        )}
        <Spacing mr={1} />

        <Spacing px={1}>
          <Button
            basic
            iconOnly
            noPadding
            onClick={() => {
              setCodeCollapsed((collapsedPrev) => {
                set(codeCollapsedUUID, !collapsedPrev);
                return !collapsedPrev;
              });

              if (!codeCollapsed) {
                setOutputCollapsed(() => {
                  set(outputCollapsedUUID, true);
                  return true;
                });
              }
            }}
            transparent
          >
            {codeCollapsed
              ? <ChevronDown muted size={UNIT * 2} />
              : <ChevronUp muted size={UNIT * 2} />
            }
          </Button>
        </Spacing>
      </FlexContainer>

      {(selected || isInProgress) && (
        <CommandButtons
          addNewBlock={addNewBlock}
          addWidget={addWidget}
          block={block}
          blocks={blocks}
          deleteBlock={deleteBlock}
          executionState={executionState}
          interruptKernel={interruptKernel}
          runBlock={runBlockAndTrack}
          savePipelineContent={savePipelineContent}
          setOutputCollapsed={setOutputCollapsed}
          updateBlock={updateBlock}
        />
      )}

      <ContainerStyle onClick={() => onClickSelectBlock()}>
        <CodeContainerStyle
          {...borderColorShareProps}
          className={selected && textareaFocused ? 'selected' : null}
          hasOutput={hasOutput}
        >
          {BlockLanguageEnum.SQL === block.language && !codeCollapsed && (
            <CodeHelperStyle>
              <FlexContainer>
                <Select
                  compact
                  label="Data provider"
                  // @ts-ignore
                  onChange={e => updateDataProviderConfig({
                    [CONFIG_KEY_DATA_PROVIDER]: e.target.value,
                  })}
                  small
                  value={dataProviderConfig[CONFIG_KEY_DATA_PROVIDER]}
                >
                  <option value="" />
                  {dataProviders?.map(({
                    id,
                    value,
                  }: DataProviderType) => (
                    <option key={id} value={value}>
                      {id}
                    </option>
                  ))}
                </Select>

                <Spacing mr={1} />

                <Select
                  compact
                  label="Profile"
                  // @ts-ignore
                  onChange={e => updateDataProviderConfig({
                    [CONFIG_KEY_DATA_PROVIDER_PROFILE]: e.target.value,
                  })}
                  small
                  value={dataProviderConfig[CONFIG_KEY_DATA_PROVIDER_PROFILE]}
                >
                  <option value="" />
                  {dataProviderProfiles?.map((id: string) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </Select>

                {(DataSourceTypeEnum.BIGQUERY === dataProviderConfig[CONFIG_KEY_DATA_PROVIDER]
                  || DataSourceTypeEnum.SNOWFLAKE === dataProviderConfig[CONFIG_KEY_DATA_PROVIDER]
                ) && (
                  <>
                    <Spacing mr={1} />

                    <FlexContainer alignItems="center">
                      <Text monospace muted small>
                        Database:
                      </Text>
                      <span>&nbsp;</span>
                      <TextInput
                        compact
                        monospace
                        onBlur={() => setTimeout(() => {
                          setAnyInputFocused(false);
                        }, 300)}
                        onChange={(e) => {
                          // @ts-ignore
                          updateDataProviderConfig({
                            [CONFIG_KEY_DATA_PROVIDER_DATABASE]: e.target.value,
                          });
                          e.preventDefault();
                        }}
                        onFocus={() => {
                          setAnyInputFocused(true);
                        }}
                        small
                        value={dataProviderConfig[CONFIG_KEY_DATA_PROVIDER_DATABASE]}
                      />
                    </FlexContainer>
                  </>
                )}

                <Spacing mr={1} />

                <FlexContainer alignItems="center">
                  <Text monospace muted small>
                    Schema to save data:
                  </Text>
                  <span>&nbsp;</span>
                  <TextInput
                    compact
                    monospace
                    onBlur={() => setTimeout(() => {
                      setAnyInputFocused(false);
                    }, 300)}
                    onChange={(e) => {
                      // @ts-ignore
                      updateDataProviderConfig({
                        [CONFIG_KEY_DATA_PROVIDER_SCHEMA]: e.target.value,
                      });
                      e.preventDefault();
                    }}
                    onFocus={() => {
                      setAnyInputFocused(true);
                    }}
                    small
                    value={dataProviderConfig[CONFIG_KEY_DATA_PROVIDER_SCHEMA]}
                  />
                </FlexContainer>
              </FlexContainer>
            </CodeHelperStyle>
          )}

          {block.upstream_blocks.length >= 1 && !codeCollapsed && (
            <CodeHelperStyle>
              <Text small>
                {BlockLanguageEnum.SQL !== block.language && 'Positional arguments for decorated function:'}
                {BlockLanguageEnum.SQL === block.language && 'Tables available in query from upstream blocks:'}
              </Text>

              <Spacing mt={1}>
                {BlockLanguageEnum.SQL !== block.language && (
                  <>
                    <Text monospace muted small>
                      {BlockTypeEnum.DATA_EXPORTER === block.type && '@data_exporter'}
                      {BlockTypeEnum.DATA_LOADER === block.type && '@data_loader'}
                      {BlockTypeEnum.TRANSFORMER === block.type && '@transformer'}
                    </Text>
                    <Text monospace muted small>
                      def {BlockTypeEnum.DATA_EXPORTER === block.type && 'export_data'
                        || (BlockTypeEnum.DATA_LOADER === block.type && 'load_data')
                        || (BlockTypeEnum.TRANSFORMER === block.type && 'transform_df')}
                      ({block.upstream_blocks.map((_,i) => i >= 1 ? `df_${i + 1}` : 'df').join(', ')}):
                    </Text>
                  </>
                )}

                {block.upstream_blocks.map((blockUUID, i) => {
                  const b = blocksMapping[blockUUID];
                  const blockColor =
                    getColorsForBlockType(b?.type, { theme: themeContext }).accent;

                  return (
                    <div key={blockUUID}>
                      {BlockLanguageEnum.SQL !== block.language && (
                        <Text inline monospace muted small>
                          &nbsp;&nbsp;&nbsp;&nbsp;df{i >= 1 ? `_${i + 1}` : null}
                        </Text>
                      )}{BlockLanguageEnum.SQL === block.language && (
                        <Text inline monospace muted small>
                          {`{{ df_${i + 1} }}`}
                        </Text>
                      )} <Text inline monospace muted small>→</Text> <Link
                        color={blockColor}
                        onClick={() => {
                          const refBlock = blockRefs?.current?.[`${b?.type}s/${b?.uuid}.py`];
                          refBlock?.current?.scrollIntoView();
                        }}
                        preventDefault
                        small
                      >
                        <Text
                          color={blockColor}
                          inline
                          monospace
                          small
                        >
                          {blockUUID}
                        </Text>
                      </Link>
                    </div>
                  );
                })}
              </Spacing>
            </CodeHelperStyle>
          )}
          {!codeCollapsed
            ? codeEditorEl
            : (
              <Spacing px={1}>
                <Text monospace muted>
                  ({pluralize('line', content?.split(/\r\n|\r|\n/).length)} collapsed)
                </Text>
              </Spacing>
            )
          }

          {isInProgress && currentTime && currentTime > runStartTime && (
            <TimeTrackerStyle>
              <Text muted>
                {`${Math.round((currentTime - runStartTime) / 1000)}`}s
              </Text>
            </TimeTrackerStyle>
          )}
        </CodeContainerStyle>

        {hasOutput && codeOutputEl}
      </ContainerStyle>

      {!noDivider && (
        <BlockDivider
          onMouseEnter={() => setAddNewBlocksVisible(true)}
          onMouseLeave={() => {
            setAddNewBlocksVisible(false);
            setAddNewBlockMenuOpenIdx(null);
          }}
        >
          {addNewBlocksVisible && (
            <AddNewBlocks
              addNewBlock={(newBlock: BlockRequestPayloadType) => {
                let content = newBlock.content;
                let configuration = newBlock.configuration;
                const upstreamBlocks = getUpstreamBlockUuids(block, newBlock);

                if ([BlockTypeEnum.DATA_LOADER, BlockTypeEnum.TRANSFORMER].includes(block.type)
                  && BlockTypeEnum.SCRATCHPAD === newBlock.type
                ) {
                  content = `from mage_ai.data_preparation.variable_manager import get_variable


df = get_variable('${pipeline.uuid}', '${block.uuid}', 'df')
`;
                }


                if (BlockLanguageEnum.SQL === block.language) {
                  configuration = {
                    ...block.configuration,
                    ...configuration,
                  };
                }

                return addNewBlock({
                  ...newBlock,
                  configuration,
                  content,
                  upstream_blocks: upstreamBlocks,
                });
              }}
              blockIdx={blockIdx}
              compact
              pipeline={pipeline}
              setAddNewBlockMenuOpenIdx={setAddNewBlockMenuOpenIdx}
              setRecsWindowOpenBlockIdx={setRecsWindowOpenBlockIdx}
            />
          )}
          <BlockDividerInner className="block-divider-inner" />
        </BlockDivider>
      )}
    </div>
  );
}

export default React.forwardRef(CodeBlockProps);
