from datetime import datetime, timedelta
from mage_ai.data_preparation.logger_manager import LoggerManager
from mage_ai.data_preparation.models.file import File
from mage_ai.data_preparation.models.pipeline import Pipeline
from mage_ai.orchestration.db import Session, session
from mage_ai.shared.array import find
from mage_ai.shared.strings import camel_to_snake_case
from sqlalchemy import Column, DateTime, Enum, Integer, JSON, String, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declared_attr, declarative_base
from sqlalchemy.sql import func
from typing import Dict, List
import enum

Base = declarative_base()
Base.query = Session.query_property()


class BaseModel(Base):
    __abstract__ = True

    @declared_attr
    def __tablename__(cls):
        return camel_to_snake_case(cls.__name__)

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @classmethod
    def create(self, **kwargs):
        model = self(**kwargs)
        model.save()
        return model

    def save(self, commit=True) -> None:
        session.add(self)
        if commit:
            try:
                session.commit()
            except Exception as e:
                session.rollback()
                raise e

    def update(self, **kwargs) -> None:
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        session.commit()

    def delete(self, commit: bool = True) -> None:
        session.delete(self)
        if commit:
            session.commit()

    def refresh(self):
        session.refresh(self)

    def to_dict(self) -> Dict:
        def __format_value(value):
            if type(value) is datetime:
                return str(value)
            return value
        return {c.name: __format_value(getattr(self, c.name)) for c in self.__table__.columns}


class PipelineSchedule(BaseModel):
    class ScheduleStatus(str, enum.Enum):
        ACTIVE = 'active'
        INACTIVE = 'inactive'

    class ScheduleType(str, enum.Enum):
        TIME = 'time'

    name = Column(String(255))
    pipeline_uuid = Column(String(255))
    schedule_type = Column(Enum(ScheduleType), default=ScheduleType.TIME)
    start_time = Column(DateTime(timezone=True))
    schedule_interval = Column(String(50), default='@once')
    status = Column(Enum(ScheduleStatus), default=ScheduleStatus.INACTIVE)
    variables = Column(JSON)

    pipeline_runs = relationship('PipelineRun', back_populates='pipeline_schedule')

    @classmethod
    def active_schedules(self) -> List['PipelineSchedule']:
        return self.query.filter(self.status == self.ScheduleStatus.ACTIVE).all()

    def current_execution_date(self) -> datetime:
        now = datetime.now()
        if self.schedule_interval == '@daily':
            return now.replace(second=0, microsecond=0, minute=0, hour=0)
        elif self.schedule_interval == '@hourly':
            return now.replace(second=0, microsecond=0, minute=0)
        elif self.schedule_interval == '@weekly':
            return now.replace(second=0, microsecond=0, minute=0, hour=0) - \
                timedelta(days=now.weekday())
        elif self.schedule_interval == '@monthly':
            return now.replace(second=0, microsecond=0, minute=0, hour=0, day=1)
        # TODO: Support cron syntax
        return None

    def should_schedule(self) -> bool:
        if self.status != self.__class__.ScheduleStatus.ACTIVE:
            return False
        if self.start_time is not None and datetime.now() < self.start_time:
            return False

        if self.schedule_interval == '@once':
            if len(self.pipeline_runs) == 0:
                return True
        else:
            """
            TODO: Implement other schedule interval checks
            """
            current_execution_date = self.current_execution_date()
            if current_execution_date is None:
                return False
            if not find(lambda x: x.execution_date == current_execution_date, self.pipeline_runs):
                return True
        return False


class PipelineRun(BaseModel):
    class PipelineRunStatus(str, enum.Enum):
        INITIAL = 'initial'
        RUNNING = 'running'
        COMPLETED = 'completed'
        FAILED = 'failed'
        CANCELLED = 'cancelled'

    pipeline_schedule_id = Column(Integer, ForeignKey('pipeline_schedule.id'))
    pipeline_uuid = Column(String(255))
    execution_date = Column(DateTime(timezone=True))
    status = Column(Enum(PipelineRunStatus), default=PipelineRunStatus.INITIAL)

    pipeline_schedule = relationship(PipelineSchedule, back_populates='pipeline_runs')

    block_runs = relationship('BlockRun', back_populates='pipeline_run')

    @property
    def execution_partition(self) -> str:
        if self.execution_date is None:
            return str(self.pipeline_schedule_id)
        else:
            return '/'.join([
                        str(self.pipeline_schedule_id),
                        self.execution_date.strftime(format='%Y%m%dT%H%M%S'),
                    ])

    @property
    def log_file(self):
        return File.from_path(LoggerManager.get_log_filepath(
            pipeline_uuid=self.pipeline_uuid,
            partition=self.execution_partition,
        ))

    @classmethod
    def active_runs(self) -> List['PipelineRun']:
        return self.query.filter(self.status == self.PipelineRunStatus.RUNNING).all()

    @classmethod
    def create(self, **kwargs) -> 'PipelineRun':
        pipeline_run = super().create(**kwargs)
        pipeline_uuid = kwargs.get('pipeline_uuid')
        if pipeline_uuid is not None:
            pipeline = Pipeline.get(pipeline_uuid)
            blocks = pipeline.get_executable_blocks()
            for b in blocks:
                BlockRun.create(
                    pipeline_run_id=pipeline_run.id,
                    block_uuid=b.uuid,
                )
        return pipeline_run

    def all_blocks_completed(self) -> bool:
        return all(b.status == BlockRun.BlockRunStatus.COMPLETED
                   for b in self.block_runs)


class BlockRun(BaseModel):
    class BlockRunStatus(str, enum.Enum):
        INITIAL = 'initial'
        QUEUED = 'queued'
        RUNNING = 'running'
        COMPLETED = 'completed'
        FAILED = 'failed'
        CANCELLED = 'cancelled'

    pipeline_run_id = Column(Integer, ForeignKey('pipeline_run.id'))
    block_uuid = Column(String(255))
    status = Column(Enum(BlockRunStatus), default=BlockRunStatus.INITIAL)

    pipeline_run = relationship(PipelineRun, back_populates='block_runs')

    @property
    def log_file(self):
        return File.from_path(LoggerManager.get_log_filepath(
            pipeline_uuid=self.pipeline_run.pipeline_uuid,
            block_uuid=self.block_uuid,
            partition=self.pipeline_run.execution_partition,
        ))

    @classmethod
    def get(self, pipeline_run_id: int = None, block_uuid: str = None) -> 'BlockRun':
        block_runs = self.query.filter(
            BlockRun.pipeline_run_id == pipeline_run_id,
            BlockRun.block_uuid == block_uuid,
        ).all()
        if len(block_runs) > 0:
            return block_runs[0]
        return None

    def get_outputs(self, sample_count: int = None) -> List[Dict]:
        pipeline = Pipeline.get(self.pipeline_run.pipeline_uuid)
        block = pipeline.get_block(self.block_uuid)
        return block.get_outputs(
            execution_partition=self.pipeline_run.execution_partition,
            sample_count=sample_count,
        )
