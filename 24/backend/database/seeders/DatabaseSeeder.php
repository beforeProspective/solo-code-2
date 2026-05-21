<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Hotel;
use App\Models\Room;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $user = User::create([
            'name' => 'Demo User',
            'email' => 'demo@example.com',
            'password' => Hash::make('password'),
        ]);

        $hotels = [
            [
                'name' => '北京王府井希尔顿酒店',
                'description' => '位于北京市中心繁华地段，毗邻王府井步行街，交通便利，周边商业设施完善。酒店拥有豪华客房、中西餐厅、健身房、游泳池等设施，为您提供舒适便捷的住宿体验。',
                'address' => '北京市东城区王府井东大街8号',
                'city' => '北京',
                'star_rating' => 5.0,
                'image' => 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
                'facilities' => ['免费WiFi', '游泳池', '健身房', '餐厅', '停车场', '24小时前台', '商务中心', '会议室'],
            ],
            [
                'name' => '上海外滩华尔道夫酒店',
                'description' => '坐落于上海外滩历史建筑群中，融合了上海的历史韵味与现代奢华。酒店客房宽敞舒适，可欣赏黄浦江和陆家嘴天际线美景，是商务和休闲旅客的理想选择。',
                'address' => '上海市黄浦区中山东一路2号',
                'city' => '上海',
                'star_rating' => 5.0,
                'image' => 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
                'facilities' => ['免费WiFi', '豪华餐厅', '酒吧', 'SPA水疗', '健身房', '商务中心', '礼宾服务', '机场接送'],
            ],
            [
                'name' => '三亚海棠湾喜来登度假酒店',
                'description' => '位于三亚海棠湾畔，拥有私人海滩和无敌海景。酒店设有多个餐厅、儿童俱乐部、水上运动中心等设施，是家庭度假和蜜月旅行的绝佳选择。',
                'address' => '海南省三亚市海棠湾海棠北路168号',
                'city' => '三亚',
                'star_rating' => 4.5,
                'image' => 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
                'facilities' => ['私人海滩', '游泳池', 'SPA水疗', '儿童俱乐部', '餐厅', '水上运动', '免费WiFi', '停车场'],
            ],
        ];

        foreach ($hotels as $hotelData) {
            $hotel = Hotel::create($hotelData);

            $rooms = match($hotel->name) {
                '北京王府井希尔顿酒店' => [
                    ['name' => '豪华大床房', 'description' => '宽敞舒适的大床房，配备高品质床品和现代化设施，城市景观。', 'price' => 899.00, 'bed_count' => 1, 'size' => 45, 'image' => 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600'],
                    ['name' => '行政套房', 'description' => '独立客厅与卧室，配备行政酒廊特权，享受尊贵服务。', 'price' => 1599.00, 'bed_count' => 1, 'size' => 75, 'image' => 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600'],
                    ['name' => '家庭双床房', 'description' => '两张单人床，适合家庭入住，配备儿童友好设施。', 'price' => 1099.00, 'bed_count' => 2, 'size' => 50, 'image' => 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600'],
                ],
                '上海外滩华尔道夫酒店' => [
                    ['name' => '豪华江景房', 'description' => '俯瞰黄浦江和陆家嘴天际线，装修典雅奢华。', 'price' => 1899.00, 'bed_count' => 1, 'size' => 55, 'image' => 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600'],
                    ['name' => '行政套房', 'description' => '独立起居室，配备大理石浴室，享受专属管家服务。', 'price' => 3299.00, 'bed_count' => 1, 'size' => 90, 'image' => 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600'],
                    ['name' => '总统套房', 'description' => '酒店顶级套房，独立餐厅、书房和私人厨房，极致奢华体验。', 'price' => 8899.00, 'bed_count' => 2, 'size' => 180, 'image' => 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600'],
                ],
                '三亚海棠湾喜来登度假酒店' => [
                    ['name' => '花园景观房', 'description' => '热带花园景观，配备私人阳台，感受度假氛围。', 'price' => 799.00, 'bed_count' => 1, 'size' => 50, 'image' => 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600'],
                    ['name' => '海景大床房', 'description' => '180度海景，私人阳台，配备超大浴缸。', 'price' => 1299.00, 'bed_count' => 1, 'size' => 60, 'image' => 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=600'],
                    ['name' => '泳池别墅', 'description' => '独立泳池别墅，私人花园，尊享管家服务。', 'price' => 3599.00, 'bed_count' => 2, 'size' => 150, 'image' => 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600'],
                ],
                default => [],
            };

            foreach ($rooms as $roomData) {
                $hotel->rooms()->create($roomData);
            }
        }
    }
}
