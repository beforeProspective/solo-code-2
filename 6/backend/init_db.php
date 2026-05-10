<?php

require_once __DIR__ . '/vendor/autoload.php';

use App\Kernel;
use Symfony\Component\Dotenv\Dotenv;
use Doctrine\ORM\Tools\SchemaTool;
use App\Entity\Lens;
use App\Entity\Adapter;
use App\Entity\SamplePhoto;
use App\Entity\MaintenanceRecord;

$dotenv = new Dotenv();
$dotenv->load(__DIR__ . '/.env');

$kernel = new Kernel($_SERVER['APP_ENV'], (bool)$_SERVER['APP_DEBUG']);
$kernel->boot();

$container = $kernel->getContainer();
$entityManager = $container->get('doctrine')->getManager();

echo "创建数据库表结构...\n";

$metadata = $entityManager->getMetadataFactory()->getAllMetadata();
$schemaTool = new SchemaTool($entityManager);
$schemaTool->updateSchema($metadata, true);

echo "数据库表结构创建完成！\n\n";

echo "添加测试数据...\n";

$lensesData = [
    [
        'brand' => 'Canon',
        'model' => 'EF 50mm f/1.8 II',
        'mountType' => 'Canon EF',
        'focalLength' => 50,
        'maxAperture' => 1.8,
        'minAperture' => 22,
        'productionYear' => 1990,
        'description' => '经典小痰盂，性价比极高的标准定焦镜头',
        'condition' => '9成新',
        'purchasePrice' => 300,
        'purchaseDate' => new DateTime('2023-01-15'),
        'serialNumber' => 'CN123456789',
        'hasAutoFocus' => true
    ],
    [
        'brand' => 'Nikon',
        'model' => 'AF Nikkor 35mm f/2D',
        'mountType' => 'Nikon F',
        'focalLength' => 35,
        'maxAperture' => 2.0,
        'minAperture' => 22,
        'productionYear' => 1995,
        'description' => '人文扫街利器，轻便小巧',
        'condition' => '8.5成新',
        'purchasePrice' => 800,
        'purchaseDate' => new DateTime('2023-03-20'),
        'serialNumber' => 'NK987654321',
        'hasAutoFocus' => true
    ],
    [
        'brand' => 'Leica',
        'model' => 'Summicron-M 50mm f/2',
        'mountType' => 'Leica M',
        'focalLength' => 50,
        'maxAperture' => 2.0,
        'minAperture' => 16,
        'productionYear' => 1975,
        'description' => '经典徕卡M卡口镜头，德味十足',
        'condition' => '收藏级',
        'purchasePrice' => 5000,
        'purchaseDate' => new DateTime('2022-11-10'),
        'serialNumber' => 'LC555666777',
        'hasAutoFocus' => false
    ],
    [
        'brand' => 'Zeiss',
        'model' => 'Planar T* 85mm f/1.4',
        'mountType' => 'Canon EF',
        'focalLength' => 85,
        'maxAperture' => 1.4,
        'minAperture' => 16,
        'productionYear' => 2005,
        'description' => '蔡司经典人像镜头，焦外虚化梦幻',
        'condition' => '9.5成新',
        'purchasePrice' => 3500,
        'purchaseDate' => new DateTime('2023-06-05'),
        'serialNumber' => 'ZS111222333',
        'hasAutoFocus' => false
    ],
    [
        'brand' => 'Pentax',
        'model' => 'FA 77mm f/1.8 Limited',
        'mountType' => 'Pentax K',
        'focalLength' => 77,
        'maxAperture' => 1.8,
        'minAperture' => 22,
        'productionYear' => 1999,
        'description' => '宾得三公主之一，传说中的限量版镜头',
        'condition' => '9成新',
        'purchasePrice' => 2800,
        'purchaseDate' => new DateTime('2023-08-12'),
        'serialNumber' => 'PX444555666',
        'hasAutoFocus' => true
    ]
];

$lenses = [];
foreach ($lensesData as $lensData) {
    $lens = new Lens();
    $lens->setBrand($lensData['brand']);
    $lens->setModel($lensData['model']);
    $lens->setMountType($lensData['mountType']);
    $lens->setFocalLength($lensData['focalLength']);
    $lens->setMaxAperture($lensData['maxAperture']);
    $lens->setMinAperture($lensData['minAperture']);
    $lens->setProductionYear($lensData['productionYear']);
    $lens->setDescription($lensData['description']);
    $lens->setCondition($lensData['condition']);
    $lens->setPurchasePrice($lensData['purchasePrice']);
    $lens->setPurchaseDate($lensData['purchaseDate']);
    $lens->setSerialNumber($lensData['serialNumber']);
    $lens->setHasAutoFocus($lensData['hasAutoFocus']);
    
    $entityManager->persist($lens);
    $lenses[] = $lens;
}

$adaptersData = [
    [
        'brand' => 'Metabones',
        'model' => 'EF to E Mount T Ultra',
        'fromMount' => 'Canon EF',
        'toMount' => 'Sony E',
        'description' => '支持自动对焦的电子转接环',
        'hasAutoFocus' => true,
        'hasInfinityFocus' => true,
        'purchasePrice' => 2500,
        'purchaseDate' => new DateTime('2023-02-01'),
        'quantity' => 1,
        'condition' => '9成新'
    ],
    [
        'brand' => 'K&F Concept',
        'model' => 'Nikon F to Sony E',
        'fromMount' => 'Nikon F',
        'toMount' => 'Sony E',
        'description' => '手动对焦转接环，带光圈控制',
        'hasAutoFocus' => false,
        'hasInfinityFocus' => true,
        'purchasePrice' => 200,
        'purchaseDate' => new DateTime('2023-04-15'),
        'quantity' => 2,
        'condition' => '全新'
    ],
    [
        'brand' => 'Fotodiox',
        'model' => 'Leica M to Fujifilm X',
        'fromMount' => 'Leica M',
        'toMount' => 'Fujifilm X',
        'description' => '高精度徕卡转富士X卡口',
        'hasAutoFocus' => false,
        'hasInfinityFocus' => true,
        'purchasePrice' => 350,
        'purchaseDate' => new DateTime('2023-01-20'),
        'quantity' => 1,
        'condition' => '9.5成新'
    ]
];

foreach ($adaptersData as $adapterData) {
    $adapter = new Adapter();
    $adapter->setBrand($adapterData['brand']);
    $adapter->setModel($adapterData['model']);
    $adapter->setFromMount($adapterData['fromMount']);
    $adapter->setToMount($adapterData['toMount']);
    $adapter->setDescription($adapterData['description']);
    $adapter->setHasAutoFocus($adapterData['hasAutoFocus']);
    $adapter->setHasInfinityFocus($adapterData['hasInfinityFocus']);
    $adapter->setPurchasePrice($adapterData['purchasePrice']);
    $adapter->setPurchaseDate($adapterData['purchaseDate']);
    $adapter->setQuantity($adapterData['quantity']);
    $adapter->setCondition($adapterData['condition']);
    
    $entityManager->persist($adapter);
}

$photosData = [
    [
        'lensIndex' => 0,
        'title' => '城市夜景',
        'description' => '使用大光圈拍摄的城市夜景',
        'imageUrl' => 'https://picsum.photos/seed/night1/800/600',
        'apertureUsed' => 2.0,
        'shutterSpeed' => 0.02,
        'isoUsed' => 800,
        'cameraModel' => 'Canon EOS 5D Mark IV',
        'dateTaken' => new DateTime('2023-05-10'),
        'notes' => '手持拍摄，防抖效果不错'
    ],
    [
        'lensIndex' => 1,
        'title' => '街头人像',
        'description' => '35mm焦段的街头人像',
        'imageUrl' => 'https://picsum.photos/seed/portrait1/800/600',
        'apertureUsed' => 2.8,
        'shutterSpeed' => 0.005,
        'isoUsed' => 200,
        'cameraModel' => 'Nikon D750',
        'dateTaken' => new DateTime('2023-06-15'),
        'notes' => '自然光拍摄'
    ],
    [
        'lensIndex' => 2,
        'title' => '人文纪实',
        'description' => '徕卡镜头的德味色彩',
        'imageUrl' => 'https://picsum.photos/seed/street1/800/600',
        'apertureUsed' => 4.0,
        'shutterSpeed' => 0.01,
        'isoUsed' => 400,
        'cameraModel' => 'Leica M10',
        'dateTaken' => new DateTime('2023-07-20'),
        'notes' => '手动对焦，估焦拍摄'
    ],
    [
        'lensIndex' => 3,
        'title' => '人像特写',
        'description' => '85mm人像镜头的虚化效果',
        'imageUrl' => 'https://picsum.photos/seed/portrait2/800/600',
        'apertureUsed' => 1.4,
        'shutterSpeed' => 0.002,
        'isoUsed' => 100,
        'cameraModel' => 'Sony A7R IV',
        'dateTaken' => new DateTime('2023-08-05'),
        'notes' => '棚拍，配合Metabones转接环'
    ],
    [
        'lensIndex' => 0,
        'title' => '黄昏风景',
        'description' => '黄金时刻的风景',
        'imageUrl' => 'https://picsum.photos/seed/sunset1/800/600',
        'apertureUsed' => 8.0,
        'shutterSpeed' => 0.1,
        'isoUsed' => 100,
        'cameraModel' => 'Canon EOS R5',
        'dateTaken' => new DateTime('2023-09-12'),
        'notes' => '使用三脚架拍摄'
    ]
];

foreach ($photosData as $photoData) {
    $photo = new SamplePhoto();
    $photo->setLens($lenses[$photoData['lensIndex']]);
    $photo->setTitle($photoData['title']);
    $photo->setDescription($photoData['description']);
    $photo->setImageUrl($photoData['imageUrl']);
    $photo->setApertureUsed($photoData['apertureUsed']);
    $photo->setShutterSpeed($photoData['shutterSpeed']);
    $photo->setIsoUsed($photoData['isoUsed']);
    $photo->setCameraModel($photoData['cameraModel']);
    $photo->setDateTaken($photoData['dateTaken']);
    $photo->setNotes($photoData['notes']);
    
    $entityManager->persist($photo);
}

$maintenanceData = [
    [
        'lensIndex' => 0,
        'checkDate' => new DateTime('2023-12-01'),
        'checkType' => '定期检查',
        'hasMold' => false,
        'moldLocation' => null,
        'moldSeverity' => null,
        'notes' => '镜头状态良好，镜片干净',
        'actionsTaken' => '清洁镜头表面',
        'nextCheckDate' => new DateTime('2024-06-01')
    ],
    [
        'lensIndex' => 2,
        'checkDate' => new DateTime('2023-11-15'),
        'checkType' => '防霉检查',
        'hasMold' => true,
        'moldLocation' => '后镜片边缘',
        'moldSeverity' => '轻微',
        'notes' => '发现轻微霉斑，需要及时处理',
        'actionsTaken' => '送专业清洁，使用干燥剂保存',
        'nextCheckDate' => new DateTime('2024-02-15')
    ],
    [
        'lensIndex' => 1,
        'checkDate' => new DateTime('2024-01-10'),
        'checkType' => '定期检查',
        'hasMold' => false,
        'moldLocation' => null,
        'moldSeverity' => null,
        'notes' => '状态良好',
        'actionsTaken' => '无',
        'nextCheckDate' => new DateTime('2024-07-10')
    ],
    [
        'lensIndex' => 3,
        'checkDate' => new DateTime('2023-10-20'),
        'checkType' => '清洁保养',
        'hasMold' => false,
        'moldLocation' => null,
        'moldSeverity' => null,
        'notes' => '定期清洁保养',
        'actionsTaken' => '清洁触点，润滑光圈',
        'nextCheckDate' => new DateTime('2024-04-20')
    ],
    [
        'lensIndex' => 4,
        'checkDate' => new DateTime('2024-04-01'),
        'checkType' => '定期检查',
        'hasMold' => true,
        'moldLocation' => '光圈叶片之间',
        'moldSeverity' => '中等',
        'notes' => '发霉情况需要专业处理',
        'actionsTaken' => '已送修',
        'nextCheckDate' => new DateTime('2024-03-01')
    ]
];

foreach ($maintenanceData as $recordData) {
    $record = new MaintenanceRecord();
    $record->setLens($lenses[$recordData['lensIndex']]);
    $record->setCheckDate($recordData['checkDate']);
    $record->setCheckType($recordData['checkType']);
    $record->setHasMold($recordData['hasMold']);
    $record->setMoldLocation($recordData['moldLocation']);
    $record->setMoldSeverity($recordData['moldSeverity']);
    $record->setNotes($recordData['notes']);
    $record->setActionsTaken($recordData['actionsTaken']);
    $record->setNextCheckDate($recordData['nextCheckDate']);
    
    $entityManager->persist($record);
}

$entityManager->flush();

echo "测试数据添加完成！\n";
echo "添加了 " . count($lenses) . " 个镜头\n";
echo "添加了 " . count($adaptersData) . " 个转接环\n";
echo "添加了 " . count($photosData) . " 张样片\n";
echo "添加了 " . count($maintenanceData) . " 条保养记录\n";

echo "\n数据库初始化成功！\n";
