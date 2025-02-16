from mage_ai.data_cleaner.transformer_actions.constants import ActionType, Axis
from mage_ai.data_preparation.models.constants import BlockLanguage, BlockType
from mage_ai.data_preparation.templates.utils import (
    read_template_file,
    template_env,
    write_template,
)
from mage_ai.io.base import DataSource
from typing import Mapping, Union
import json


MAP_DATASOURCE_TO_HANDLER = {
    DataSource.BIGQUERY: 'BigQuery',
    DataSource.POSTGRES: 'Postgres',
    DataSource.REDSHIFT: 'Redshift',
    DataSource.SNOWFLAKE: 'Snowflake',
}


def build_template_from_suggestion(suggestion: Mapping) -> str:
    """
    Creates a file template from a suggestion.

    Args:
        suggestion (Mapping): Suggestion payload generated from `BaseRule`.

    Returns:
        str: String version of Python code to execute to run this cleaning suggestion.
    """
    clean_title = suggestion['title'].lower().replace(' ', '_')
    cleaned_payload = json.dumps(suggestion['action_payload'], indent=4)
    cleaned_payload = cleaned_payload.replace('\n', '\n    ')
    template = read_template_file('transformers/suggestion_fmt.jinja')
    return (
        template.render(
            title=clean_title,
            message=suggestion['message'],
            payload=cleaned_payload,
        )
        + "\n"
    )


def fetch_template_source(
    block_type: Union[BlockType, str],
    config: Mapping[str, str],
    language: BlockLanguage = BlockLanguage.PYTHON,
) -> str:
    template_source = ''

    if BlockLanguage.PYTHON == language:
        if block_type == BlockType.DATA_LOADER:
            template_source = __fetch_data_loader_templates(config)
        elif block_type == BlockType.TRANSFORMER:
            template_source = __fetch_transformer_templates(config)
        elif block_type == BlockType.DATA_EXPORTER:
            template_source = __fetch_data_exporter_templates(config)

    return template_source


def load_template(
    block_type: Union[BlockType, str],
    config: Mapping[str, str],
    dest_path: str,
    language: BlockLanguage = BlockLanguage.PYTHON,
) -> None:
    template_source = fetch_template_source(block_type, config, language=language)
    write_template(template_source, dest_path)


def __fetch_data_loader_templates(config: Mapping[str, str]) -> str:
    data_source = config.get('data_source')
    try:
        _ = DataSource(data_source)
        template_path = f'data_loaders/{data_source.lower()}.py'
    except ValueError:
        template_path = 'data_loaders/default.jinja'

    return (
        template_env.get_template(template_path).render(
            code=config.get('existing_code', ''),
        )
        + '\n'
    )


def __fetch_transformer_templates(config: Mapping[str, str]) -> str:
    action_type = config.get('action_type')
    axis = config.get('axis')
    data_source = config.get('data_source')
    existing_code = config.get('existing_code', '')
    suggested_action = config.get('suggested_action')

    if suggested_action:
        return build_template_from_suggestion(suggested_action)

    if data_source is not None:
        return __fetch_transformer_data_warehouse_template(data_source)
    elif action_type is not None and axis is not None:
        return __fetch_transformer_action_template(action_type, axis, existing_code)
    else:
        return (
            template_env.get_template('transformers/default.jinja').render(
                code=existing_code,
            )
            + '\n'
        )


def __fetch_transformer_data_warehouse_template(data_source: DataSource):
    template = template_env.get_template('transformers/data_warehouse_transformer.jinja')
    data_source_handler = MAP_DATASOURCE_TO_HANDLER.get(data_source)
    if data_source_handler is None:
        raise ValueError(f'No associated database/warehouse for data source \'{data_source}\'')

    if data_source != DataSource.BIGQUERY:
        additional_args = '\n        loader.commit() # Permanently apply database changes'
    else:
        additional_args = ''

    return (
        template.render(
            additional_args=additional_args,
            data_source=data_source if type(data_source) is str else data_source.value,
            data_source_handler=data_source_handler,
        )
        + '\n'
    )


def __fetch_transformer_action_template(action_type: ActionType, axis: Axis, existing_code: str):
    try:
        template = template_env.get_template(
            f'transformers/transformer_actions/{axis}/{action_type}.py'
        )
    except FileNotFoundError:
        template = template_env.get_template('transformers/default.jinja')
    return template.render(code=existing_code) + '\n'


def __fetch_data_exporter_templates(config: Mapping[str, str]) -> str:
    data_source = config.get('data_source')
    try:
        _ = DataSource(data_source)
        template_path = f'data_exporters/{data_source.lower()}.py'
    except ValueError:
        template_path = 'data_exporters/default.jinja'

    return (
        template_env.get_template(template_path).render(
            code=config.get('existing_code', ''),
        )
        + '\n'
    )
