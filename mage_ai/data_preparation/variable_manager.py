from mage_ai.data_preparation.models.variable import Variable, VariableType, VARIABLE_DIR
from typing import Any, Dict, List
import os
import pandas as pd


class VariableManager:
    def __init__(self, repo_path):
        self.repo_path = repo_path
        # TODO: implement caching logic

    def add_variable(
        self,
        pipeline_uuid: str,
        block_uuid: str,
        variable_uuid: str,
        data: Any,
        variable_type: VariableType = None
    ) -> None:
        if type(data) is pd.DataFrame:
            variable_type = VariableType.DATAFRAME
        variable = Variable(
            variable_uuid,
            self.__pipeline_path(pipeline_uuid),
            block_uuid,
            variable_type=variable_type,
        )
        variable.write_data(data)

    def get_variable(
        self,
        pipeline_uuid: str,
        block_uuid: str,
        variable_uuid: str,
        variable_type: VariableType = None,
        sample: bool = False
    ) -> Any:
        variable = Variable(
            variable_uuid,
            self.__pipeline_path(pipeline_uuid),
            block_uuid,
            variable_type=variable_type,
        )
        return variable.read_data(sample=sample)

    def get_variables_by_pipeline(self, pipeline_uuid: str) -> Dict[str, List[str]]:
        variable_dir_path = os.path.join(self.__pipeline_path(pipeline_uuid), VARIABLE_DIR)
        if not os.path.exists(variable_dir_path):
            return dict()
        block_dirs = os.listdir(variable_dir_path)
        variables_by_block = dict()
        for d in block_dirs:
            variables = os.listdir(os.path.join(variable_dir_path, d))
            variables_by_block[d] = sorted([v.split('.')[0] for v in variables])
        return variables_by_block

    def __pipeline_path(self, pipeline_uuid: str) -> str:
        return os.path.join(self.repo_path, 'pipelines', pipeline_uuid)