'use client';

import { DeleteOutlined, EditOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Dormitory, DormitoryMember } from '@/lib';
import { useAdminClassroom, useAdminDormitories, useAdminStudents } from '../admin-queries';

interface NameFormValues {
  name: string;
}

interface ScoreFormValues {
  delta: number;
  reason: string;
}

function requestKey(dormitoryId: string): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dormitory:${dormitoryId}:${id}`;
}

export function DormitoriesPage() {
  const { notification } = AntApp.useApp();
  const { data: classroom } = useAdminClassroom();
  const { students } = useAdminStudents();
  const {
    dormitories,
    createDormitory,
    renameDormitory,
    deleteDormitory,
    addMembers,
    removeMember,
    scoreDormitory,
    isLoading,
    isSaving,
    isScoring,
  } = useAdminDormitories();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Key[]>([]);
  const [nameOpen, setNameOpen] = useState(false);
  const [editing, setEditing] = useState<Dormitory | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const scoreBusinessKey = useRef<string | null>(null);
  const [nameForm] = Form.useForm<NameFormValues>();
  const [membersForm] = Form.useForm<{ studentIds: string[] }>();
  const [scoreForm] = Form.useForm<ScoreFormValues>();

  useEffect(() => {
    if (selectedId && dormitories.some((item) => item.id === selectedId)) return;
    setSelectedId(dormitories[0]?.id ?? null);
    setSelectedMemberIds([]);
  }, [dormitories, selectedId]);

  useEffect(() => {
    if (!nameOpen) return;
    nameForm.setFieldsValue({ name: editing?.name ?? '' });
  }, [editing, nameForm, nameOpen]);

  const selected = dormitories.find((item) => item.id === selectedId) ?? null;
  const dormitoryByStudent = useMemo(
    () =>
      new Map(
        dormitories.flatMap((item) =>
          item.students.map((student) => [student.id, item.name] as const),
        ),
      ),
    [dormitories],
  );
  const memberOptions = students
    .filter((student) => student.status === 'ACTIVE' && !student.deletedAt)
    .map((student) => ({
      value: student.id,
      label: dormitoryByStudent.has(student.id)
        ? `${student.name}（${dormitoryByStudent.get(student.id)}）`
        : student.name,
    }));

  const openName = (dormitory?: Dormitory) => {
    setEditing(dormitory ?? null);
    setNameOpen(true);
  };

  const saveName = async ({ name }: NameFormValues) => {
    try {
      const saved = editing
        ? await renameDormitory({ dormitoryId: editing.id, name })
        : await createDormitory(name);
      setSelectedId(saved.id);
      setNameOpen(false);
      notification.success({ title: editing ? '寝室已重命名' : '寝室已创建' });
    } catch (error) {
      notification.error({ title: error instanceof Error ? error.message : '保存失败' });
    }
  };

  const saveMembers = async ({ studentIds }: { studentIds: string[] }) => {
    if (!selected) return;
    try {
      await addMembers({ dormitoryId: selected.id, studentIds });
      setMembersOpen(false);
      membersForm.resetFields();
      notification.success({ title: `已分配 ${studentIds.length} 人` });
    } catch (error) {
      notification.error({ title: error instanceof Error ? error.message : '分配失败' });
    }
  };

  const saveScore = async ({ delta, reason }: ScoreFormValues) => {
    if (!selected) return;
    const businessKey = scoreBusinessKey.current ?? requestKey(selected.id);
    scoreBusinessKey.current = businessKey;
    try {
      await scoreDormitory({
        dormitoryId: selected.id,
        input: {
          studentIds: selectedMemberIds.map(String),
          delta,
          reason: reason.trim(),
          businessKey,
        },
      });
      scoreBusinessKey.current = null;
      setScoreOpen(false);
      setSelectedMemberIds([]);
      scoreForm.resetFields();
      notification.success({ title: `已为 ${selectedMemberIds.length} 人记录积分` });
    } catch (error) {
      notification.error({ title: error instanceof Error ? error.message : '积分提交失败' });
    }
  };

  const memberColumns: ColumnsType<DormitoryMember> = [
    { title: '学生', dataIndex: 'name' },
    { title: '学号', dataIndex: 'studentNo', render: (value: string | null) => value ?? '—' },
    {
      title: '操作',
      width: 90,
      render: (_, member) => (
        <Popconfirm
          title="移出寝室？"
          okText="移出"
          cancelText="取消"
          onConfirm={async () => {
            if (!selected) return;
            try {
              await removeMember({ dormitoryId: selected.id, studentId: member.id });
              setSelectedMemberIds((current) => current.filter((id) => id !== member.id));
            } catch (error) {
              notification.error({ title: error instanceof Error ? error.message : '移出失败' });
            }
          }}
        >
          <Button type="link" danger>
            移出
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 22,
        }}
      >
        <div>
          <Typography.Title
            level={2}
            style={{ margin: '5px 0 5px', color: '#172b4d', fontSize: 27 }}
          >
            住宿生管理
          </Typography.Title>
          <Typography.Text type="secondary">{classroom?.name ?? '当前班级'}</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openName()}>
          新增寝室
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        <Card styles={{ body: { padding: 0 } }} loading={isLoading}>
          {dormitories.length > 0 ? (
            <Menu
              mode="inline"
              selectedKeys={selectedId ? [selectedId] : []}
              onClick={({ key }) => {
                setSelectedId(key);
                setSelectedMemberIds([]);
              }}
              items={dormitories.map((item) => ({
                key: item.id,
                icon: <HomeOutlined />,
                label: (
                  <Space>
                    <Typography.Text strong={item.id === selectedId}>{item.name}</Typography.Text>
                    <Tag>{item.students.length} 人</Tag>
                  </Space>
                ),
              }))}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无寝室"
              style={{ marginBlock: 32 }}
            />
          )}
        </Card>

        <Card
          title={selected?.name ?? '寝室成员'}
          extra={
            selected ? (
              <Space wrap>
                <Button icon={<EditOutlined />} onClick={() => openName(selected)}>
                  重命名
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => {
                    membersForm.resetFields();
                    setMembersOpen(true);
                  }}
                >
                  分配学生
                </Button>
                <Button
                  type="primary"
                  disabled={selectedMemberIds.length === 0}
                  onClick={() => {
                    scoreBusinessKey.current = requestKey(selected.id);
                    setScoreOpen(true);
                  }}
                >
                  寝室积分{selectedMemberIds.length ? `（${selectedMemberIds.length}）` : ''}
                </Button>
                <Popconfirm
                  title="删除寝室？"
                  description="成员会被移出寝室。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try {
                      await deleteDormitory(selected.id);
                      notification.success({ title: '寝室已删除' });
                    } catch (error) {
                      notification.error({
                        title: error instanceof Error ? error.message : '删除失败',
                      });
                    }
                  }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ) : null
          }
        >
          {selected ? (
            <Table
              rowKey="id"
              columns={memberColumns}
              dataSource={selected.students}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedMemberIds,
                onChange: setSelectedMemberIds,
              }}
              locale={{ emptyText: '暂无成员' }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先创建寝室" />
          )}
        </Card>
      </div>

      <Modal
        title={editing ? '重命名寝室' : '新增寝室'}
        open={nameOpen}
        onCancel={() => setNameOpen(false)}
        onOk={() => void nameForm.submit()}
        confirmLoading={isSaving}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
      >
        <Form form={nameForm} layout="vertical" onFinish={saveName}>
          <Form.Item
            name="name"
            label="寝室名称"
            rules={[{ required: true, whitespace: true, message: '请输入寝室名称' }, { max: 100 }]}
          >
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="分配学生"
        open={membersOpen}
        onCancel={() => setMembersOpen(false)}
        onOk={() => void membersForm.submit()}
        confirmLoading={isSaving}
        destroyOnHidden
        okText="确认"
        cancelText="取消"
      >
        <Form form={membersForm} layout="vertical" onFinish={saveMembers}>
          <Form.Item
            name="studentIds"
            label="学生"
            rules={[{ required: true, type: 'array', min: 1, message: '请选择学生' }]}
          >
            <Select mode="multiple" showSearch options={memberOptions} optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`寝室积分 · ${selected?.name ?? ''}`}
        open={scoreOpen}
        onCancel={() => {
          if (isScoring) return;
          scoreBusinessKey.current = null;
          setScoreOpen(false);
          scoreForm.resetFields();
        }}
        onOk={() => void scoreForm.submit()}
        confirmLoading={isScoring}
        closable={!isScoring}
        maskClosable={!isScoring}
        keyboard={!isScoring}
        cancelButtonProps={{ disabled: isScoring }}
        destroyOnHidden
        okText="提交"
        cancelText="取消"
      >
        <Typography.Text type="secondary">已选择 {selectedMemberIds.length} 名学生</Typography.Text>
        <Form form={scoreForm} layout="vertical" onFinish={saveScore} style={{ marginTop: 16 }}>
          <Form.Item
            name="delta"
            label="积分变化"
            rules={[
              {
                required: true,
                validator: (_, value) =>
                  Number.isInteger(value) && value !== 0
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入非 0 整数')),
              },
            ]}
          >
            <InputNumber min={-10000} max={10000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="原因"
            rules={[{ required: true, whitespace: true, message: '请输入原因' }, { max: 200 }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
