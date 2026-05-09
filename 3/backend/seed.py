from sqlalchemy.orm import Session
from models import Planet, AstronomyEvent
from datetime import date, timedelta


def seed_data(db: Session):
    planets = db.query(Planet).count()
    if planets == 0:
        planet_data = [
            {
                "name": "Mercury",
                "name_cn": "水星",
                "description": "水星是太阳系中最小的行星，也是离太阳最近的行星。它没有大气层保护，昼夜温差极大，白天可高达430°C，夜晚则降至-180°C。",
                "diameter": 4879,
                "distance_from_sun": 57.9,
                "orbital_period": 88,
                "number_of_moons": 0,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/2_feature_1600x900.jpg"
            },
            {
                "name": "Venus",
                "name_cn": "金星",
                "description": "金星是太阳系中最热的行星，被厚厚的二氧化碳大气层包围，产生极端温室效应，表面温度高达465°C。它的自转方向与大多数行星相反。",
                "diameter": 12104,
                "distance_from_sun": 108.2,
                "orbital_period": 225,
                "number_of_moons": 0,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/3_feature_1600x900.jpg"
            },
            {
                "name": "Earth",
                "name_cn": "地球",
                "description": "地球是我们唯一已知存在生命的行星。它拥有液态水、适宜的大气层和稳定的气候系统，是太阳系中最独特的行星之一。",
                "diameter": 12742,
                "distance_from_sun": 149.6,
                "orbital_period": 365.25,
                "number_of_moons": 1,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/4_feature_1600x900.jpg"
            },
            {
                "name": "Mars",
                "name_cn": "火星",
                "description": "火星被称为红色星球，因其表面富含氧化铁而呈现红色。它拥有太阳系最高的火山——奥林匹斯山，以及最大的峡谷——水手号峡谷。",
                "diameter": 6779,
                "distance_from_sun": 227.9,
                "orbital_period": 687,
                "number_of_moons": 2,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/5_feature_1600x900.jpg"
            },
            {
                "name": "Jupiter",
                "name_cn": "木星",
                "description": "木星是太阳系中最大的行星，质量是其他所有行星总和的2.5倍。它的大红斑是一个持续数百年的巨型风暴，直径比地球还大。",
                "diameter": 139820,
                "distance_from_sun": 778.5,
                "orbital_period": 4333,
                "number_of_moons": 95,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/6_feature_1600x900.jpg"
            },
            {
                "name": "Saturn",
                "name_cn": "土星",
                "description": "土星以其壮观的环系统而闻名，这些环主要由冰和岩石碎片组成。土星的密度极低，如果有足够大的海洋，它可以漂浮在水上。",
                "diameter": 116460,
                "distance_from_sun": 1434,
                "orbital_period": 10759,
                "number_of_moons": 146,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/7_feature_1600x900.jpg"
            },
            {
                "name": "Uranus",
                "name_cn": "天王星",
                "description": "天王星是一颗冰巨星，拥有独特的蓝绿色外观，这是由于其大气中含有甲烷。它的自转轴几乎与轨道平面平行，像一个躺着旋转的球。",
                "diameter": 50724,
                "distance_from_sun": 2871,
                "orbital_period": 30687,
                "number_of_moons": 27,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/8_feature_1600x900.jpg"
            },
            {
                "name": "Neptune",
                "name_cn": "海王星",
                "description": "海王星是太阳系中最遥远的行星，拥有太阳系中最强的风暴，风速可达2100公里/小时。它的深蓝色同样来自大气中的甲烷。",
                "diameter": 49244,
                "distance_from_sun": 4495,
                "orbital_period": 60190,
                "number_of_moons": 14,
                "image_url": "https://solarsystem.nasa.gov/system/stellar_items/image_files/9_feature_1600x900.jpg"
            }
        ]

        for data in planet_data:
            db.add(Planet(**data))

    events = db.query(AstronomyEvent).count()
    if events == 0:
        today = date.today()
        event_data = [
            {
                "title": "Meteor Shower",
                "title_cn": "象限仪座流星雨",
                "event_date": today + timedelta(days=5),
                "description": "象限仪座流星雨是每年年初的重要流星雨，每小时天顶流量约120颗。观测最佳时间是午夜到黎明。",
                "category": "流星雨"
            },
            {
                "title": "Full Moon",
                "title_cn": "满月",
                "event_date": today + timedelta(days=12),
                "description": "这是一个特别明亮的满月，也被称为'狼月'，是一年中的第一个满月。",
                "category": "月相"
            },
            {
                "title": "Mercury at Greatest Eastern Elongation",
                "title_cn": "水星东大距",
                "event_date": today + timedelta(days=20),
                "description": "水星到达东大距，是观测水星的最佳时机，可在日落后西方低空看到这颗难以捉摸的行星。",
                "category": "行星观测"
            },
            {
                "title": "Lunar Eclipse",
                "title_cn": "月偏食",
                "event_date": today + timedelta(days=45),
                "description": "一场可观测的月偏食，月球的一部分会进入地球的本影区，呈现出迷人的古铜色。",
                "category": "交食"
            },
            {
                "title": "Mars Opposition",
                "title_cn": "火星冲日",
                "event_date": today + timedelta(days=90),
                "description": "火星冲日意味着火星、地球和太阳几乎成一直线，火星整夜可见，是观测火星的绝佳时机。",
                "category": "行星观测"
            },
            {
                "title": "Perseid Meteor Shower Peak",
                "title_cn": "英仙座流星雨极大",
                "event_date": today + timedelta(days=180),
                "description": "英仙座流星雨是年度最受欢迎的流星雨之一，每小时天顶流量可达100颗以上，适合家庭观测。",
                "category": "流星雨"
            },
            {
                "title": "Supermoon",
                "title_cn": "超级月亮",
                "event_date": today + timedelta(days=120),
                "description": "满月时月球恰好处于近地点附近，看起来比平时更大更亮，比远地点满月大14%，亮30%。",
                "category": "月相"
            },
            {
                "title": "Geminid Meteor Shower",
                "title_cn": "双子座流星雨",
                "event_date": today + timedelta(days=300),
                "description": "双子座流星雨被称为年度最佳流星雨，流量大且稳定，每小时天顶流量可达150颗，颜色多样。",
                "category": "流星雨"
            }
        ]

        for data in event_data:
            db.add(AstronomyEvent(**data))

    db.commit()
