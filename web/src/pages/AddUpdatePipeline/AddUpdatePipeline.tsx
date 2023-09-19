import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useGet, useMutate } from 'restful-react'
import { useParams } from 'react-router-dom'
import { get, isEmpty, isUndefined, set } from 'lodash-es'
import { parse, stringify } from 'yaml'
import { Menu, PopoverPosition } from '@blueprintjs/core'
import { Container, PageBody, Layout, ButtonVariation, Text, useToaster, SplitButton, Button } from '@harnessio/uicore'
import { Color, FontVariation } from '@harnessio/design-system'
import type { OpenapiCommitFilesRequest, RepoCommitFilesResponse, RepoFileContent, TypesPipeline } from 'services/code'
import { useStrings } from 'framework/strings'
import { useGetRepositoryMetadata } from 'hooks/useGetRepositoryMetadata'
import { useGetResourceContent } from 'hooks/useGetResourceContent'
import MonacoSourceCodeEditor from 'components/SourceCodeEditor/MonacoSourceCodeEditor'
import { PluginsPanel } from 'components/PluginsPanel/PluginsPanel'
import useRunPipelineModal from 'components/RunPipelineModal/RunPipelineModal'
import { LoadingSpinner } from 'components/LoadingSpinner/LoadingSpinner'
import { useAppContext } from 'AppContext'
import type { CODEProps } from 'RouteDefinitions'
import { getErrorMessage } from 'utils/Utils'
import { decodeGitContent } from 'utils/GitUtils'
import { RepositoryPageHeader } from 'components/RepositoryPageHeader/RepositoryPageHeader'
import pipelineSchemaV1 from './schema/pipeline-schema-v1.json'
import pipelineSchemaV0 from './schema/pipeline-schema-v0.json'
import { DRONE_CONFIG_YAML_FILE_SUFFIXES, YamlVersion } from './Constants'

import css from './AddUpdatePipeline.module.scss'

const StarterPipelineV1: Record<string, any> = {
  version: 1,
  kind: 'pipeline',
  spec: {
    stages: [
      {
        name: 'build',
        type: 'ci',
        spec: {
          steps: [
            {
              name: 'build',
              type: 'script',
              spec: {
                image: 'golang',
                run: 'echo "hello world"'
              }
            }
          ]
        }
      }
    ]
  }
}

const StarterPipelineV0: Record<string, any> = {
  kind: 'pipeline',
  type: 'docker',
  name: 'default',
  steps: [
    {
      name: 'test',
      image: 'alpine',
      commands: ['echo hello world']
    }
  ]
}

enum PipelineSaveAndRunAction {
  SAVE,
  RUN,
  SAVE_AND_RUN
}

interface PipelineSaveAndRunOption {
  title: string
  action: PipelineSaveAndRunAction
}

const AddUpdatePipeline = (): JSX.Element => {
  const { routes } = useAppContext()
  const { getString } = useStrings()
  const { pipeline } = useParams<CODEProps>()
  const { repoMetadata } = useGetRepositoryMetadata()
  const { showError, showSuccess, clear: clearToaster } = useToaster()
  const [yamlVersion, setYAMLVersion] = useState<YamlVersion>()
  const [pipelineAsYAML, setPipelineAsYaml] = useState<string>('')
  const { openModal: openRunPipelineModal } = useRunPipelineModal()
  const repoPath = useMemo(() => repoMetadata?.path || '', [repoMetadata])
  const [isExistingPipeline, setIsExistingPipeline] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [generatingPipeline, setGeneratingPipeline] = useState<boolean>(false)

  const pipelineSaveOption: PipelineSaveAndRunOption = {
    title: getString('save'),
    action: PipelineSaveAndRunAction.SAVE
  }

  const pipelineRunOption: PipelineSaveAndRunOption = {
    title: getString('run'),
    action: PipelineSaveAndRunAction.RUN
  }

  const pipelineSaveAndRunOption: PipelineSaveAndRunOption = {
    title: getString('pipelines.saveAndRun'),
    action: PipelineSaveAndRunAction.SAVE_AND_RUN
  }

  const pipelineSaveAndRunOptions: PipelineSaveAndRunOption[] = [pipelineSaveAndRunOption, pipelineSaveOption]

  const [selectedOption, setSelectedOption] = useState<PipelineSaveAndRunOption>()

  const { mutate, loading } = useMutate<RepoCommitFilesResponse>({
    verb: 'POST',
    path: `/api/v1/repos/${repoPath}/+/commits`
  })

  // Fetch pipeline metadata to fetch pipeline YAML file content
  const { data: pipelineData, loading: fetchingPipeline } = useGet<TypesPipeline>({
    path: `/api/v1/repos/${repoPath}/+/pipelines/${pipeline}`,
    lazy: !repoMetadata
  })

  const {
    data: pipelineYAMLFileContent,
    loading: fetchingPipelineYAMLFileContent,
    refetch: fetchPipelineYAMLFileContent
  } = useGetResourceContent({
    repoMetadata,
    gitRef: pipelineData?.default_branch || '',
    resourcePath: pipelineData?.config_path || ''
  })

  const originalPipelineYAMLFileContent = useMemo(
    (): string => decodeGitContent((pipelineYAMLFileContent?.content as RepoFileContent)?.data),
    [pipelineYAMLFileContent?.content]
  )

  // set YAML version for Pipeline setup
  useEffect(() => {
    setYAMLVersion(
      DRONE_CONFIG_YAML_FILE_SUFFIXES.find((suffix: string) => pipelineData?.config_path?.endsWith(suffix))
        ? YamlVersion.V0
        : YamlVersion.V1
    )
  }, [pipelineData])

  // check if file already exists and has some content
  useEffect(() => {
    setIsExistingPipeline(!isEmpty(originalPipelineYAMLFileContent) && !isUndefined(originalPipelineYAMLFileContent))
  }, [originalPipelineYAMLFileContent])

  // load initial content on the editor
  useEffect(() => {
    if (isExistingPipeline) {
      setPipelineAsYaml(originalPipelineYAMLFileContent)
    } else {
      // load with starter pipeline
      try {
        setPipelineAsYaml(stringify(yamlVersion === YamlVersion.V1 ? StarterPipelineV1 : StarterPipelineV0))
      } catch (ex) {
        // ignore exception
      }
    }
  }, [yamlVersion, isExistingPipeline, originalPipelineYAMLFileContent])

  // find if editor content was modified
  useEffect(() => {
    setIsDirty(originalPipelineYAMLFileContent !== pipelineAsYAML)
  }, [originalPipelineYAMLFileContent, pipelineAsYAML])

  // set initial CTA title
  useEffect(() => {
    setSelectedOption(isDirty ? pipelineSaveAndRunOption : pipelineRunOption)
  }, [isDirty])

  const handleSaveAndRun = (option: PipelineSaveAndRunOption): void => {
    if ([PipelineSaveAndRunAction.SAVE_AND_RUN, PipelineSaveAndRunAction.SAVE].includes(option?.action)) {
      try {
        const data: OpenapiCommitFilesRequest = {
          actions: [
            {
              action: isExistingPipeline ? 'UPDATE' : 'CREATE',
              path: pipelineData?.config_path,
              payload: pipelineAsYAML,
              sha: isExistingPipeline ? pipelineYAMLFileContent?.sha : ''
            }
          ],
          branch: pipelineData?.default_branch || '',
          title: `${isExistingPipeline ? getString('updated') : getString('created')} pipeline ${pipeline}`,
          message: ''
        }

        mutate(data)
          .then(() => {
            fetchPipelineYAMLFileContent()
            clearToaster()
            showSuccess(getString(isExistingPipeline ? 'pipelines.updated' : 'pipelines.created'))
            if (option?.action === PipelineSaveAndRunAction.SAVE_AND_RUN && repoMetadata && pipeline) {
              openRunPipelineModal({ repoMetadata, pipeline })
            }
            setSelectedOption(pipelineRunOption)
          })
          .catch(error => {
            showError(getErrorMessage(error), 0, 'pipelines.failedToSavePipeline')
          })
      } catch (exception) {
        showError(getErrorMessage(exception), 0, 'pipelines.failedToSavePipeline')
      }
    }
  }

  const updatePipelineWithPluginData = (
    existingPipeline: Record<string, any>,
    payload: Record<string, any>
  ): Record<string, any> => {
    const pipelineAsObjClone = { ...existingPipeline }
    if (Object.keys(pipelineAsObjClone).length > 0) {
      const stepInsertPath = 'spec.stages.0.spec.steps'
      let existingSteps: [unknown] = get(pipelineAsObjClone, stepInsertPath, [])
      if (existingSteps.length > 0) {
        existingSteps.push(payload)
      } else {
        existingSteps = [payload]
      }
      set(pipelineAsObjClone, stepInsertPath, existingSteps)
      return pipelineAsObjClone
    }
    return existingPipeline
  }

  const handlePluginAddUpdateIntoYAML = useCallback(
    (_isUpdate: boolean, pluginFormData: Record<string, any>): void => {
      try {
        const pipelineAsObj = parse(pipelineAsYAML)
        const updatedPipelineAsObj = updatePipelineWithPluginData(pipelineAsObj, pluginFormData)
        if (Object.keys(updatedPipelineAsObj).length > 0) {
          // avoid setting to empty pipeline in case pipeline update with plugin data fails
          setPipelineAsYaml(stringify(updatedPipelineAsObj))
        }
      } catch (ex) {
        // ignore exception
      }
    },
    [yamlVersion, isExistingPipeline, originalPipelineYAMLFileContent, pipelineAsYAML]
  )

  const handleGeneratePipeline = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/v1/repos/${repoPath}/+/pipelines/generate`)
      if (response.ok && response.status === 200) {
        const pipelineAsYAML = await response.text()
        if (pipelineAsYAML) {
          setPipelineAsYaml(pipelineAsYAML)
        }
      }
      setGeneratingPipeline(false)
    } catch (exception) {
      showError(getErrorMessage(exception), 0, getString('pipelines.failedToGenerate'))
      setGeneratingPipeline(false)
    }
  }, [repoPath])

  const renderCTA = useCallback(() => {
    /* Do not render CTA till pipeline existence info is obtained */
    if (fetchingPipeline || !pipelineData) {
      return <></>
    }
    switch (selectedOption?.action) {
      case PipelineSaveAndRunAction.RUN:
        return (
          <Button
            variation={ButtonVariation.PRIMARY}
            text={getString('run')}
            onClick={() => {
              if (repoMetadata && pipeline) {
                openRunPipelineModal({ repoMetadata, pipeline })
              }
            }}
          />
        )
      case PipelineSaveAndRunAction.SAVE:
      case PipelineSaveAndRunAction.SAVE_AND_RUN:
        return isExistingPipeline ? (
          <Button
            variation={ButtonVariation.PRIMARY}
            text={getString('save')}
            onClick={() => {
              handleSaveAndRun(pipelineSaveOption)
            }}
            disabled={loading || !isDirty}
          />
        ) : (
          <SplitButton
            text={
              <Text color={Color.WHITE} font={{ variation: FontVariation.BODY2_SEMI, weight: 'bold' }}>
                {pipelineSaveAndRunOptions[0].title}
              </Text>
            }
            disabled={loading || !isDirty}
            variation={ButtonVariation.PRIMARY}
            popoverProps={{
              interactionKind: 'click',
              usePortal: true,
              position: PopoverPosition.BOTTOM_RIGHT,
              popoverClassName: css.popover
            }}
            intent="primary"
            onClick={() => handleSaveAndRun(pipelineSaveAndRunOptions[0])}>
            {[pipelineSaveAndRunOptions[1]].map(option => {
              return (
                <Menu.Item
                  className={css.menuItem}
                  key={option.title}
                  text={<Text font={{ variation: FontVariation.BODY2 }}>{option.title}</Text>}
                  onClick={() => {
                    handleSaveAndRun(option)
                    setSelectedOption(option)
                  }}
                />
              )
            })}
          </SplitButton>
        )
      default:
        return <></>
    }
  }, [
    loading,
    fetchingPipeline,
    fetchingPipelineYAMLFileContent,
    isDirty,
    repoMetadata,
    pipeline,
    selectedOption,
    isExistingPipeline,
    pipelineAsYAML,
    pipelineData
  ])

  if (fetchingPipeline || fetchingPipelineYAMLFileContent) {
    return <LoadingSpinner visible={true} />
  }

  return (
    <>
      <Container className={css.main}>
        <Layout.Vertical>
          <RepositoryPageHeader
            repoMetadata={repoMetadata}
            title={getString('pageTitle.executions')}
            dataTooltipId="repositoryExecutions"
            extraBreadcrumbLinks={
              repoMetadata && [
                {
                  label: getString('pageTitle.pipelines'),
                  url: routes.toCODEPipelines({ repoPath: repoMetadata.path as string })
                },
                ...(pipeline
                  ? [
                      {
                        label: pipeline,
                        url: ''
                      }
                    ]
                  : [])
              ]
            }
            content={<Layout.Horizontal flex={{ justifyContent: 'space-between' }}>{renderCTA()}</Layout.Horizontal>}
          />
          <Layout.Horizontal
            padding={{ left: 'medium', bottom: 'medium' }}
            className={css.generateHeader}
            spacing="large"
            flex={{ justifyContent: 'flex-start' }}>
            <Button
              text={getString('generate')}
              variation={ButtonVariation.PRIMARY}
              className={css.generate}
              onClick={handleGeneratePipeline}
              disabled={generatingPipeline}
            />
            <Text font={{ variation: FontVariation.H5 }}>{getString('generateHelptext')}</Text>
          </Layout.Horizontal>
        </Layout.Vertical>
        <PageBody>
          <Layout.Horizontal className={css.layout}>
            <Container className={css.editorContainer}>
              <MonacoSourceCodeEditor
                language={'yaml'}
                schema={yamlVersion === YamlVersion.V1 ? pipelineSchemaV1 : pipelineSchemaV0}
                source={pipelineAsYAML}
                onChange={(value: string) => setPipelineAsYaml(value)}
              />
            </Container>
            {yamlVersion === YamlVersion.V1 && (
              <Container className={css.pluginsContainer}>
                <PluginsPanel onPluginAddUpdate={handlePluginAddUpdateIntoYAML} />
              </Container>
            )}
          </Layout.Horizontal>
        </PageBody>
      </Container>
    </>
  )
}

export default AddUpdatePipeline
