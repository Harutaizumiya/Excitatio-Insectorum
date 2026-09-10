import { Card, Col, Row, Skeleton } from "antd";

export default function AdminLoading() {
  return (
    <div style={{ minHeight: "60vh", padding: 8 }} aria-label="班主任后台加载中">
      <Skeleton active paragraph={{ rows: 2 }} title={{ width: 220 }} />
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {[1, 2, 3, 4].map((item) => (
          <Col key={item} xs={24} sm={12} xl={6}>
            <Card>
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
