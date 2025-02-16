import React, { useContext } from 'react';
import { ThemeContext } from 'styled-components';

import BlockType from '@interfaces/BlockType';
import FileType from '@interfaces/FileType';
import Folder, { FolderSharedProps } from './Folder';
import { ContainerStyle } from './index.style';
import { ContextAreaProps } from '@components/ContextMenu';
import { rearrangePipelinesFolderToTop } from './utils';

type FileBrowserProps = {
  blocks: BlockType[];
  files: FileType[];
  widgets?: BlockType[];
} & FolderSharedProps & ContextAreaProps;

export enum FileContextEnum {
  BLOCK_FILE = 'block_file',
  DISABLED = 'disabled',
  FILE = 'file',
  FOLDER = 'folder',
  PIPELINE = 'pipeline',
}

function FileBrowser({
  blocks = [],
  files,
  widgets = [],
  ...props
}: FileBrowserProps, ref) {
  const themeContext = useContext(ThemeContext);
  const pipelineBlockUuids = blocks.concat(widgets).map(({ uuid }) => uuid);
  const filesWithPipelinesFolderFirst = files?.map((project: FileType) => ({
    ...project,
    children: rearrangePipelinesFolderToTop(project.children),
  }));

  return (
    <ContainerStyle ref={ref}>
      {filesWithPipelinesFolderFirst?.map((file: FileType) => (
        <Folder
          {...props}
          file={file}
          key={file.name}
          level={0}
          pipelineBlockUuids={pipelineBlockUuids}
          theme={themeContext}
        />
      ))}
    </ContainerStyle>
  );
}

export default React.forwardRef(FileBrowser);
