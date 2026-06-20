import { LoadingOutlined } from '@ant-design/icons';

export function AppSpinIndicator(props: { size?: number }) {
  const { size = 28 } = props;
  return <LoadingOutlined style={{ fontSize: size }} spin />;
}

