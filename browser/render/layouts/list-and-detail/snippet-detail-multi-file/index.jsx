import React, { Fragment } from 'react'
import i18n from 'render/lib/i18n'
import FAIcon from '@fortawesome/react-fontawesome'
import formatDate from 'lib/date-format'
import ReactTooltip from 'react-tooltip'
import _ from 'lodash'
import eventEmitter from 'lib/event-emitter'
import { getExtension, generateKey } from 'lib/util'
import Clipboard from 'core/functions/clipboard'
import TagItem from 'render/components/tag-item'
import { toast } from 'react-toastify'
import { toJS } from 'mobx'
import CodeEditor from 'render/components/code-editor'
import TagInput from 'render/components/tag-input'
import CodeMirror from 'codemirror'
import 'codemirror/mode/meta'
import './snippet-detail-multi-file'

export default class SnippetDetailMultiFile extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      isEditing: false,
      selectedFile: 0,
      editingFiles: props.snippet.files
    }
  }

  componentDidMount () {
    eventEmitter.on('snippets:saveAll', this.handleSaveChangesEvent.bind(this))
    eventEmitter.on(
      'snippets:unSave',
      this.handleDiscardChangesEvent.bind(this)
    )
  }

  componentWillUnmount () {
    eventEmitter.off('snippets:saveAll', this.handleSaveChangesEvent.bind(this))
    eventEmitter.off(
      'snippets:unSave',
      this.handleDiscardChangesEvent.bind(this)
    )
  }

  handleSaveChangesEvent () {
    if (this.state.isEditing) {
      this.handleSaveChangesClick()
    }
  }

  handleDiscardChangesEvent () {
    if (this.state.isEditing) {
      this.handleDiscardChangesClick()
    }
  }

  renderTopBar () {
    const { isEditing } = this.state
    return (
      <div className="top-bar">
        <div className="left-tool">
          {isEditing ? (
            <div
              className="save-btn"
              data-tip={i18n.__('save changes')}
              onClick={this.handleSaveChangesClick.bind(this)}
            >
              <FAIcon icon="check" />
            </div>
          ) : (
            <div
              className="edit-btn"
              data-tip={i18n.__('edit')}
              onClick={this.handleEditButtonClick.bind(this)}
            >
              <FAIcon icon="edit" />
            </div>
          )}
          {isEditing && (
            <div
              className="discard-btn"
              data-tip={i18n.__('discard changes')}
              onClick={this.handleDiscardChangesClick.bind(this)}
            >
              <FAIcon icon="times" />
            </div>
          )}
        </div>
        <div className="right-tool">
          {!isEditing && (
            <div
              className="delete-btn"
              onClick={this.handleDeleteClick.bind(this)}
              data-tip={i18n.__('delete snippet')}
            >
              <FAIcon icon="trash-alt" />
            </div>
          )}
        </div>
      </div>
    )
  }

  handleSaveChangesClick () {
    const { editor, tags, name, description } = this.refs
    const { snippet, store } = this.props
    const { editingFiles } = this.state
    const nameChanged = snippet.name !== name.value
    const newTags = tags.wrappedInstance.getTags()
    const tagChanged = !_.isEqual(snippet.tags, newTags)
    const descriptionChanged = snippet.description !== description.value
    if (tagChanged || descriptionChanged || nameChanged) {
      const newSnippet = _.clone(snippet)
      newSnippet.name = name.value
      newSnippet.tags = newTags
      newSnippet.description = description.value
      newSnippet.files = editingFiles
      store.updateSnippet(newSnippet)
    }
    this.setState({ isEditing: false }, () => {
      eventEmitter.emit('snippet-detail:edit-end')
    })
    editor.setOption('readOnly', true)
  }

  handleDeleteClick () {
    const { config, store, snippet } = this.props
    if (config.ui.showDeleteConfirmDialog) {
      if (!confirm(i18n.__('Are you sure to delete this snippet?'))) {
        return
      }
    }
    const newSnippet = _.clone(snippet)
    store.deleteSnippet(newSnippet)
    store.selectedSnippet = null
  }

  handleEditButtonClick () {
    const { editor } = this.refs
    const { snippet } = this.props
    this.setState({ isEditing: true }, () => {
      editor.applyEditorStyle()
      this.setState({ editingFiles: snippet.files })
      eventEmitter.emit('snippet-detail:edit-start')
      editor.setOption('readOnly', false)
    })
  }

  handleDiscardChangesClick () {
    const { editor } = this.refs
    const { snippet } = this.props
    this.setState(
      {
        isEditing: false,
        editingFiles: snippet.files,
        selectedFile: 0
      },
      () => {
        eventEmitter.emit('snippet-detail:edit-end')
        editor.setOption('readOnly', true)
      }
    )
  }

  handleEditingFileNameChange (event, index) {
    const { editor } = this.refs
    const { editingFiles } = this.state
    const newEditingFiles = toJS(editingFiles)
    const name = event.target.value
    newEditingFiles[index].name = name
    const fileExtension = getExtension(name)
    const resultMode = CodeMirror.findModeByExtension(fileExtension)
    // if the mode for that language exists then use it otherwise use text
    if (resultMode) {
      const snippetMode = resultMode.mode
      if (snippetMode === 'htmlmixed') {
        require(`codemirror/mode/xml/xml`)
        editor.setOption('mode', 'xml')
        editor.setOption('htmlMode', true)
      } else {
        require(`codemirror/mode/${snippetMode}/${snippetMode}`)
        editor.setOption('mode', snippetMode)
      }
    } else {
      editor.setOption('mode', 'null')
    }
    this.setState({ editingFiles: newEditingFiles })
  }

  handleDeleteFile (event, fileIndex) {
    event.stopPropagation()
    const { snippet, store, config } = this.props
    const { editingFiles, isEditing, selectedFile } = this.state
    if (snippet.files.length > 1 || editingFiles.length > 1) {
      // remove directly if not in editing mode
      if (config.ui.showDeleteConfirmDialog) {
        if (!confirm(i18n.__('Are you sure to delete this file?'))) {
          return
        }
      }
      if (!isEditing) {
        const newSnippet = _.clone(snippet)
        newSnippet.files.splice(fileIndex, 1)
        store.updateSnippet(newSnippet)
      } else {
        // remove temporary from state
        const newEditingFiles = toJS(editingFiles)
        newEditingFiles.splice(fileIndex, 1)
        this.setState({ editingFiles: newEditingFiles })
      }
      // prevent reading deleted snippet
      if (isEditing) {
        if (selectedFile > editingFiles.length - 1) {
          this.handleChangeFileClick(editingFiles.length - 1)
        }
      } else {
        if (selectedFile > snippet.files.length - 1) {
          this.handleChangeFileClick(snippet.files.length - 1)
        }
      }
    } else {
      toast.error(i18n.__('The snippet must have at least 1 file'))
    }
  }

  handleNewFileClick () {
    const { editor } = this.refs
    const { editingFiles } = this.state
    // make a clone of the current editing file list
    const newEditingFiles = toJS(editingFiles)
    // push a new file to the list
    newEditingFiles.push({ key: generateKey(), name: '', value: '' })
    this.setState({ editingFiles: newEditingFiles }, () => {
      // a new input tag will automatically created after set state and we want
      // to focus on that input tag
      const files = this.refs.fileList.firstChild.childNodes
      const file = files[files.length - 2].querySelector('input')
      this.handleChangeFileClick(newEditingFiles.length - 1)
      file.focus()
    })
    editor.applyEditorStyle()
  }

  handleChangeFileClick (index, callback) {
    const { editor } = this.refs
    const { snippet } = this.props
    const { editingFiles, isEditing } = this.state
    // set the new selected file index
    this.setState({ selectedFile: index }, () => {
      // if the snippet is in the editing mode, interact with the state instead
      // of the snippet in prop
      const file = isEditing ? editingFiles[index] : snippet.files[index]
      if (file) {
        const fileExtension = getExtension(file.name)
        const resultMode = CodeMirror.findModeByExtension(fileExtension)
        // if the mode for that language exists then use it otherwise use text
        if (resultMode) {
          const snippetMode = resultMode.mode
          if (snippetMode === 'htmlmixed') {
            require(`codemirror/mode/xml/xml`)
            editor.setOption('mode', 'xml')
            editor.setOption('htmlMode', true)
          } else {
            require(`codemirror/mode/${snippetMode}/${snippetMode}`)
            editor.setOption('mode', snippetMode)
          }
        } else {
          editor.setOption('mode', 'null')
        }
        editor.setValue(file.value)
        if (callback && typeof callback === 'function') {
          callback()
        }
      }
    })
  }

  handleEditingFileValueChange () {
    const { editor } = this.refs
    const { isEditing, selectedFile, editingFiles } = this.state
    if (isEditing) {
      const newEditingFiles = toJS(editingFiles)
      newEditingFiles[selectedFile].value = editor.getValue()
      this.setState({ editingFiles: newEditingFiles })
    }
  }

  renderSnippet () {
    const { isEditing, selectedFile, editingFiles } = this.state
    const { config, snippet } = this.props
    return (
      <Fragment>
        {this.renderTopBar()}
        <div className="header">
          {this.renderSnippetName()}
          {this.renderOtherInfo()}
        </div>
        {this.renderTagList()}
        {this.renderDescription()}
        {this.renderFileList()}
        <CodeEditor
          isEditing={isEditing}
          selectedFile={selectedFile}
          editingFiles={editingFiles}
          config={config}
          snippet={snippet}
          handleChangeFileClick={() => this.handleChangeFileClick()}
          handleEditingFileValueChange={() =>
            this.handleEditingFileValueChange()
          }
          type="multi"
          ref="editor"
        />
      </Fragment>
    )
  }

  renderFileList () {
    const { snippet } = this.props
    const { selectedFile, isEditing, editingFiles } = this.state
    const files = isEditing ? editingFiles : snippet.files
    return (
      <div className="file-list" ref="fileList">
        <ul>
          {files.map((file, index) => (
            <li
              key={file.key}
              onClick={() => this.handleChangeFileClick(index)}
              style={{
                width: `${100 / files.length}%`
              }}
              className={index === selectedFile ? 'selected' : ''}
            >
              {isEditing ? (
                <input
                  type="text"
                  className="fileName"
                  onChange={e => this.handleEditingFileNameChange(e, index)}
                  defaultValue={file.name}
                />
              ) : file.name ? (
                file.name
              ) : (
                'untitled'
              )}
              <div className="tools">
                {!isEditing && (
                  <span
                    className="icon"
                    onClick={() => this.handleCopyFile(index)}
                  >
                    <FAIcon icon="copy" />
                  </span>
                )}
                {
                  <span
                    className="icon"
                    onClick={e => this.handleDeleteFile(e, index)}
                  >
                    <FAIcon icon="trash-alt" />
                  </span>
                }
              </div>
            </li>
          ))}
          {isEditing && (
            <li
              className="add-file-btn"
              onClick={this.handleNewFileClick.bind(this)}
            >
              <FAIcon icon="plus" />
            </li>
          )}
        </ul>
      </div>
    )
  }

  handleCopyFile (index) {
    const { snippet, config, store } = this.props
    const file = snippet.files[index]
    Clipboard.set(file.value)
    if (config.ui.showCopyNoti) {
      toast.info(i18n.__('Copied to clipboard'), { autoClose: 2000 })
    }
    const newSnippet = _.clone(snippet)
    store.increaseCopyTime(newSnippet)
  }

  renderOtherInfo () {
    const { config, snippet } = this.props
    return (
      <p>
        {config.ui.showSnippetCreateTime && (
          <span className="createAt info">
            {i18n.__('Create at')} : {formatDate(snippet.createAt)}
          </span>
        )}
        {config.ui.showSnippetUpdateTime && (
          <span className="updateAt info">
            {i18n.__('Last update')}: {formatDate(snippet.updateAt)}
          </span>
        )}
        {config.ui.showSnippetCopyCount && (
          <span className="copyCount info">
            {i18n.__('Copy')} : {snippet.copy} {i18n.__('times')}
          </span>
        )}
      </p>
    )
  }

  renderSnippetName () {
    const { snippet } = this.props
    const { isEditing } = this.state
    return (
      <p className="snippet-name">
        {isEditing ? (
          <input
            type="text"
            className="snippet-name-input"
            ref="name"
            defaultValue={snippet.name}
          />
        ) : (
          snippet.name
        )}
      </p>
    )
  }

  handleSnippetLangChange () {
    const { editor } = this.refs
    const snippetMode = CodeMirror.findModeByName(this.refs.lang.value).mode
    require(`codemirror/mode/${snippetMode}/${snippetMode}`)
    editor.setOption('mode', snippetMode)
  }

  renderDescription () {
    const { snippet } = this.props
    const { isEditing } = this.state
    return (
      <p className={`description ${isEditing ? 'editing' : ''}`}>
        {isEditing ? (
          <textarea ref="description" defaultValue={snippet.description} />
        ) : (
          snippet.description
        )}
      </p>
    )
  }

  renderTagList () {
    const { snippet, config } = this.props
    const { isEditing } = this.state
    const tags = snippet.tags.filter(tag => tag)
    return (
      <div className="tags">
        <span className="icon">
          <FAIcon icon="tags" />
        </span>
        {isEditing ? (
          <TagInput ref="tags" color={config.ui.tagColor} defaultTags={tags} />
        ) : tags.length > 0 ? (
          tags.map((tag, index) => (
            <TagItem config={config} tag={tag} key={index} />
          ))
        ) : (
          'No tag'
        )}
      </div>
    )
  }

  render () {
    const { snippet } = this.props
    return (
      <div className="snippet-detail-multi-file">
        <ReactTooltip place="bottom" effect="solid" />
        {snippet && this.renderSnippet()}
      </div>
    )
  }
}
