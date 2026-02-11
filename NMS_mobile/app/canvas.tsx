import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Line,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { COLORS } from '../constants/theme';
import { useWebSocketContext } from '../context/WebSocketContext';

// Иконки для объектов карты
const ICONS = {
  router: require('../assets/canvas/Router.png'),
  router_off: require('../assets/canvas/Router_off.png'),
  router_plan: require('../assets/canvas/Router_plan.png'),
  router_trans: require('../assets/canvas/Router_trans.png'),
  computer: require('../assets/canvas/Computer.png'),
  switch: require('../assets/canvas/Switch.png'),
  switch_trans: require('../assets/canvas/Switch_trans.png'),
  not_install: require('../assets/canvas/other/not_install.png'),
  not_settings: require('../assets/canvas/other/not_settings.png'),
  copy: require('../assets/canvas/other/copy.png'),
  copy_fail: require('../assets/canvas/other/copy_fail.png'),
};

// Типы данных карты
interface XY {
  x: number;
  y: number;
}

interface SwitchNode {
  id: string;
  name: string;
  xy: XY;
  ip?: string;
  pingok?: boolean;
  notinstalled?: string;
  notsettings?: string;
  copyid?: string;
  mayakup?: boolean | string;
  model?: string;
}

interface PlanSwitchNode {
  id: string;
  name: string;
  xy: XY;
}

interface UserNode {
  id: string;
  name: string;
  xy: XY;
}

interface SoapNode {
  id: string;
  name: string;
  xy: XY;
}

interface Legend {
  id: string;
  name?: string;
  text?: string;
  xy: XY;
  width?: string | number;
  height?: string | number;
  bordercolor?: string;
  borderwidth?: string | number;
  zalivka?: string;
  zalivkacolor?: string;
  textcolor?: string;
  textsize?: string | number;
  textalign?: string;
}

interface Magistral {
  id: string;
  startid: string;
  endid: string;
  color?: string;
  width?: string | number;
  style?: string;
  nodes?: string;
  startport?: string;
  endport?: string;
  startportcolor?: string;
  endportcolor?: string;
  startportfar?: string | number;
  endportfar?: string | number;
}

interface MapData {
  map: {
    name: string;
    width?: string | number;
    height?: string | number;
  };
  switches?: SwitchNode[];
  plan_switches?: PlanSwitchNode[];
  users?: UserNode[];
  soaps?: SoapNode[];
  legends?: Legend[];
  magistrals?: Magistral[];
}

const ICON_SIZE = 50;
const OVERLAY_SIZE = 10;
const NODE_COLORS = {
  switch_online: '#00aa00',
  switch_offline: '#aa0000',
  switch_notinstalled: '#666666',
  switch_notsettings: '#aaaa00',
  switch_copy: '#0088aa',
  plan_switch: '#888888',
  user: '#0088ff',
  soap: '#ff8800',
};

export default function CanvasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mapPath: string; mapName: string }>();
  const { isConnected, sendRequest, addConnectionHandler } = useWebSocketContext();

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Загрузка карты...');
  const [scale, setScale] = useState(1);
  const scrollViewRef = useRef<ScrollView>(null);

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  useEffect(() => {
    const removeHandler = addConnectionHandler((connected) => {
      if (connected && params.mapPath) {
        loadMap();
      } else if (!connected) {
        setStatusMessage('Отключено от сервера');
      }
    });

    if (isConnected && params.mapPath) {
      loadMap();
    }

    return () => {
      removeHandler();
    };
  }, [params.mapPath]);

  const loadMap = async () => {
    if (!params.mapPath) return;

    try {
      setIsLoading(true);
      setStatusMessage('Загрузка карты...');

      const response = await sendRequest('file_get', {
        path: params.mapPath,
      });

      if (response.success && response.data) {
        setMapData(response.data);
        const switchCount = response.data.switches?.length || 0;
        const userCount = response.data.users?.length || 0;
        setStatusMessage(`Объектов: ${switchCount + userCount}`);
      } else {
        setStatusMessage('Ошибка загрузки карты');
      }
    } catch (error) {
      console.error('Error loading map:', error);
      setStatusMessage('Ошибка подключения');
    } finally {
      setIsLoading(false);
    }
  };

  // Парсинг промежуточных точек магистрали
  const parseNodes = (nodesStr?: string): [number, number][] => {
    if (!nodesStr) return [];
    const regex = /\[?([+-]?\d+(?:\.\d+)?)\s*;\s*([+-]?\d+(?:\.\d+)?)\]?/g;
    const points: [number, number][] = [];
    let match;
    while ((match = regex.exec(nodesStr)) !== null) {
      points.push([parseFloat(match[1]), parseFloat(match[2])]);
    }
    return points;
  };

  // Получение координат узла по ID
  const getNodeXY = (nodeId: string): XY | null => {
    if (!mapData) return null;

    const allNodes = [
      ...(mapData.switches || []),
      ...(mapData.plan_switches || []),
      ...(mapData.users || []),
      ...(mapData.soaps || []),
      ...(mapData.legends || []),
    ];

    const node = allNodes.find((n) => n.id === nodeId);
    return node?.xy || null;
  };

  // Определение цвета свитча
  const getSwitchColor = (node: SwitchNode): string => {
    if (node.notinstalled === '-1') return NODE_COLORS.switch_notinstalled;
    if (node.notsettings === '-1') return NODE_COLORS.switch_notsettings;
    if (node.copyid && node.copyid !== 'none' && node.copyid !== '') return NODE_COLORS.switch_copy;
    if (node.pingok === false || String(node.pingok).toLowerCase() === 'false') {
      return NODE_COLORS.switch_offline;
    }
    return NODE_COLORS.switch_online;
  };

  // Рендер легенды
  const renderLegend = (legend: Legend) => {
    const x = legend.xy.x;
    const y = legend.xy.y;
    const w = parseFloat(String(legend.width || 100));
    const h = parseFloat(String(legend.height || 50));
    const borderColor = legend.bordercolor || '#000';
    const borderWidth = parseFloat(String(legend.borderwidth || 2));
    const fillColor = legend.zalivka === '0' ? 'transparent' : (legend.zalivkacolor || '#fff');
    const textColor = legend.textcolor || '#000';
    const textSize = parseInt(String(legend.textsize || 14));
    const text = legend.name || legend.text || '';

    return (
      <G key={`legend-${legend.id}`}>
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fillColor}
          stroke={borderColor}
          strokeWidth={borderWidth}
        />
        {text && (
          <SvgText
            x={x + w / 2}
            y={y + h / 2 + textSize / 3}
            fontSize={textSize}
            fontWeight="bold"
            fill={textColor}
            textAnchor="middle"
          >
            {text}
          </SvgText>
        )}
      </G>
    );
  };

  // Рендер магистрали
  const renderMagistral = (magistral: Magistral) => {
    const startXY = getNodeXY(magistral.startid);
    const endXY = getNodeXY(magistral.endid);

    if (!startXY || !endXY) return null;

    const color = magistral.color || '#000';
    const strokeWidth = parseFloat(String(magistral.width || 1));
    const intermediate = parseNodes(magistral.nodes);
    const points: [number, number][] = [
      [startXY.x, startXY.y],
      ...intermediate,
      [endXY.x, endXY.y],
    ];

    const lines = [];
    for (let i = 0; i < points.length - 1; i++) {
      lines.push(
        <Line
          key={`mag-${magistral.id}-${i}`}
          x1={points[i][0]}
          y1={points[i][1]}
          x2={points[i + 1][0]}
          y2={points[i + 1][1]}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={magistral.style === 'psdot' ? '5,5' : undefined}
        />
      );
    }

    // Рендер портов
    const portLabels = [];
    if (magistral.startport && magistral.startport !== '0') {
      const far = parseFloat(String(magistral.startportfar || 10));
      const dx = points[1][0] - points[0][0];
      const dy = points[1][1] - points[0][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const px = points[0][0] + (dx / len) * far;
        const py = points[0][1] + (dy / len) * far;
        portLabels.push(
          <G key={`port-start-${magistral.id}`}>
            <Rect
              x={px - 15}
              y={py - 10}
              width={30}
              height={20}
              fill="#008080"
              stroke={color}
              strokeWidth={1}
            />
            <SvgText
              x={px}
              y={py + 4}
              fontSize={12}
              fontWeight="bold"
              fill={magistral.startportcolor || '#FFC107'}
              textAnchor="middle"
            >
              {magistral.startport}
            </SvgText>
          </G>
        );
      }
    }

    if (magistral.endport && magistral.endport !== '0') {
      const far = parseFloat(String(magistral.endportfar || 10));
      const lastIdx = points.length - 1;
      const dx = points[lastIdx - 1][0] - points[lastIdx][0];
      const dy = points[lastIdx - 1][1] - points[lastIdx][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const px = points[lastIdx][0] + (dx / len) * far;
        const py = points[lastIdx][1] + (dy / len) * far;
        portLabels.push(
          <G key={`port-end-${magistral.id}`}>
            <Rect
              x={px - 15}
              y={py - 10}
              width={30}
              height={20}
              fill="#008080"
              stroke={color}
              strokeWidth={1}
            />
            <SvgText
              x={px}
              y={py + 4}
              fontSize={12}
              fontWeight="bold"
              fill={magistral.endportcolor || '#FFC107'}
              textAnchor="middle"
            >
              {magistral.endport}
            </SvgText>
          </G>
        );
      }
    }

    return (
      <G key={`magistral-group-${magistral.id}`}>
        {lines}
        {portLabels}
      </G>
    );
  };

  // Выбор иконки для свитча в зависимости от статуса
  const getSwitchIcon = (node: SwitchNode) => {
    if (node.notinstalled === '-1') return ICONS.not_install;
    if (node.notsettings === '-1') return ICONS.not_settings;
    if (node.copyid && node.copyid !== 'none' && node.copyid !== '') return ICONS.copy;
    if (node.pingok === false || String(node.pingok).toLowerCase() === 'false') {
      return ICONS.router_off;
    }
    return ICONS.router;
  };

  // Рендер свитча (возвращает данные для отрисовки поверх SVG)
  const renderSwitchOverlay = (node: SwitchNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    const icon = getSwitchIcon(node);
    
    return {
      id: `switch-${node.id}`,
      type: 'switch',
      x: x - ICON_SIZE / 2,
      y: y - ICON_SIZE / 2,
      icon,
      name: node.name || 'Свитч',
      mayakup: node.mayakup,
      nodeX: x,
      nodeY: y,
    };
  };

  // Рендер свитча в SVG (только подпись и mayak индикатор)
  const renderSwitch = (node: SwitchNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    const halfSize = ICON_SIZE / 2;

    // Индикатор mayakup
    let mayakIndicator = null;
    if (node.mayakup !== undefined) {
      const isUp = node.mayakup === true || String(node.mayakup).toLowerCase() === 'true';
      mayakIndicator = (
        <Circle
          cx={x}
          cy={y}
          r={5}
          fill={isUp ? '#00ff00' : '#ff0000'}
          stroke="#000"
          strokeWidth={1}
        />
      );
    }

    return (
      <G key={`switch-${node.id}`}>
        {mayakIndicator}
        {/* Подпись */}
        <SvgText
          x={x}
          y={y + halfSize + 14}
          fontSize={12}
          fontWeight="bold"
          fill="#dbdbdb"
          textAnchor="middle"
        >
          {node.name || 'Свитч'}
        </SvgText>
      </G>
    );
  };

  // Рендер план-свитча overlay
  const renderPlanSwitchOverlay = (node: PlanSwitchNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    
    return {
      id: `plan-${node.id}`,
      type: 'plan_switch',
      x: x - ICON_SIZE / 2,
      y: y - ICON_SIZE / 2,
      icon: ICONS.router_plan,
      name: node.name || 'План',
      nodeX: x,
      nodeY: y,
    };
  };

  // Рендер план-свитча в SVG (только подпись)
  const renderPlanSwitch = (node: PlanSwitchNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    const halfSize = ICON_SIZE / 2;

    return (
      <G key={`plan-${node.id}`}>
        <SvgText
          x={x}
          y={y + halfSize + 14}
          fontSize={12}
          fontWeight="bold"
          fill="#dbdbdb"
          textAnchor="middle"
        >
          {node.name || 'План'}
        </SvgText>
      </G>
    );
  };

  // Рендер пользователя overlay
  const renderUserOverlay = (node: UserNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    
    return {
      id: `user-${node.id}`,
      type: 'user',
      x: x - ICON_SIZE / 2,
      y: y - ICON_SIZE / 2,
      icon: ICONS.computer,
      name: node.name || 'Клиент',
      nodeX: x,
      nodeY: y,
    };
  };

  // Рендер пользователя в SVG (только подпись)
  const renderUser = (node: UserNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    const halfSize = ICON_SIZE / 2;

    return (
      <G key={`user-${node.id}`}>
        <SvgText
          x={x}
          y={y + halfSize + 14}
          fontSize={12}
          fontWeight="bold"
          fill="#dbdbdb"
          textAnchor="middle"
        >
          {node.name || 'Клиент'}
        </SvgText>
      </G>
    );
  };

  // Рендер мыльницы overlay
  const renderSoapOverlay = (node: SoapNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    
    return {
      id: `soap-${node.id}`,
      type: 'soap',
      x: x - ICON_SIZE / 2,
      y: y - ICON_SIZE / 2,
      icon: ICONS.switch,
      name: node.name || 'Мыльница',
      nodeX: x,
      nodeY: y,
    };
  };

  // Рендер мыльницы в SVG (только подпись)
  const renderSoap = (node: SoapNode) => {
    const x = node.xy.x;
    const y = node.xy.y;
    const halfSize = ICON_SIZE / 2;

    return (
      <G key={`soap-${node.id}`}>
        <SvgText
          x={x}
          y={y + halfSize + 14}
          fontSize={12}
          fontWeight="bold"
          fill="#dbdbdb"
          textAnchor="middle"
        >
          {node.name || 'Мыльница'}
        </SvgText>
      </G>
    );
  };

  // Собираем все overlay элементы
  const getOverlayItems = () => {
    if (!mapData) return [];
    
    const items: any[] = [];
    
    mapData.switches?.forEach((node) => {
      items.push(renderSwitchOverlay(node));
    });
    
    mapData.plan_switches?.forEach((node) => {
      items.push(renderPlanSwitchOverlay(node));
    });
    
    mapData.users?.forEach((node) => {
      items.push(renderUserOverlay(node));
    });
    
    mapData.soaps?.forEach((node) => {
      items.push(renderSoapOverlay(node));
    });
    
    return items;
  };

  // Рендер всей карты
  const renderMap = () => {
    if (!mapData) return null;

    const mapWidth = parseInt(String(mapData.map.width || 1200));
    const mapHeight = parseInt(String(mapData.map.height || 800));
    const overlayItems = getOverlayItems();

    return (
      <View style={{ width: mapWidth * scale, height: mapHeight * scale }}>
        <Svg
          width={mapWidth * scale}
          height={mapHeight * scale}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Фон */}
          <Rect x={0} y={0} width={mapWidth} height={mapHeight} fill="#008080" />

          {/* Легенды (на заднем плане) */}
          {mapData.legends?.map((legend) => renderLegend(legend))}

          {/* Магистрали */}
          {mapData.magistrals?.map((mag) => renderMagistral(mag))}

          {/* Подписи свитчей */}
          {mapData.switches?.map((node) => renderSwitch(node))}

          {/* Подписи план-свитчей */}
          {mapData.plan_switches?.map((node) => renderPlanSwitch(node))}

          {/* Подписи пользователей */}
          {mapData.users?.map((node) => renderUser(node))}

          {/* Подписи мыльниц */}
          {mapData.soaps?.map((node) => renderSoap(node))}
        </Svg>
        
        {/* Изображения поверх SVG */}
        {overlayItems.map((item) => (
          <Image
            key={item.id}
            source={item.icon}
            style={{
              position: 'absolute',
              left: item.x * scale,
              top: item.y * scale,
              width: ICON_SIZE * scale,
              height: ICON_SIZE * scale,
            }}
            resizeMode="contain"
          />
        ))}
      </View>
    );
  };

  const mapName = params.mapName || mapData?.map?.name || 'Карта';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {mapName}
        </Text>
        <View style={styles.headerRight}>
          {/* Кнопки масштаба */}
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => setScale(Math.max(0.3, scale - 0.2))}
          >
            <Text style={styles.zoomText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.zoomButton}
            onPress={() => setScale(Math.min(3, scale + 0.2))}
          >
            <Text style={styles.zoomText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Загрузка карты...</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.canvasContainer}
          horizontal
          showsHorizontalScrollIndicator={true}
          showsVerticalScrollIndicator={true}
          maximumZoomScale={3}
          minimumZoomScale={0.3}
          contentContainerStyle={styles.canvasContent}
        >
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.canvasInner}
          >
            {renderMap()}
          </ScrollView>
        </ScrollView>
      )}

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
        <Text style={styles.statusText}>{statusMessage}</Text>
        <Text style={styles.scaleText}>Масштаб: {Math.round(scale * 100)}%</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#111',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoomButton: {
    width: 36,
    height: 36,
    backgroundColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  zoomText: {
    color: COLORS.textWhite,
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textGray,
    marginTop: 12,
    fontSize: 16,
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#008080',
  },
  canvasContent: {
    flexGrow: 1,
  },
  canvasInner: {
    flexGrow: 1,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#44FF44',
  },
  statusDisconnected: {
    backgroundColor: '#FF4444',
  },
  statusText: {
    color: COLORS.textGray,
    fontSize: 14,
    flex: 1,
  },
  scaleText: {
    color: COLORS.textGray,
    fontSize: 12,
    marginLeft: 12,
  },
});
