<?php

require_once __DIR__ . '/../vendor/autoload.php';

use App\Config\Database;

$db = (new Database())->getConnection();

$sql = "
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    website VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    part_number VARCHAR(50),
    category VARCHAR(50),
    package VARCHAR(50),
    value VARCHAR(100),
    tolerance VARCHAR(20),
    voltage_rating VARCHAR(20),
    power_rating VARCHAR(20),
    description TEXT,
    datasheet_url VARCHAR(255),
    datasheet_file VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id INTEGER NOT NULL,
    supplier_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER DEFAULT 10,
    location VARCHAR(100),
    unit_price DECIMAL(10, 2),
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS boms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    project_name VARCHAR(100),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_id INTEGER NOT NULL,
    component_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    reference_designator VARCHAR(50),
    notes TEXT,
    FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_part_number ON components(part_number);
CREATE INDEX idx_components_category ON components(category);
CREATE INDEX idx_inventory_component ON inventory(component_id);
CREATE INDEX idx_bom_items_bom ON bom_items(bom_id);
";

try {
    $db->exec($sql);
    echo "Tables created successfully.\n";
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM users");
    $count = $stmt->fetch()['count'];
    
    if ($count == 0) {
        $adminPassword = password_hash('admin123', PASSWORD_DEFAULT);
        $userPassword = password_hash('user123', PASSWORD_DEFAULT);
        
        $db->exec("
            INSERT INTO users (username, password_hash, email, role) VALUES
            ('admin', '$adminPassword', 'admin@example.com', 'admin'),
            ('user', '$userPassword', 'user@example.com', 'user')
        ");
        echo "Default users created: admin/admin123, user/user123\n";
    }
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM suppliers");
    $count = $stmt->fetch()['count'];
    
    if ($count == 0) {
        $db->exec("
            INSERT INTO suppliers (name, contact_person, phone, email, address, website) VALUES
            ('DigiKey', 'John Smith', '+1-800-344-4539', 'sales@digikey.com', '701 Brooks Ave S, Thief River Falls, MN 56701', 'https://www.digikey.com'),
            ('Mouser Electronics', 'Jane Doe', '+1-800-346-6873', 'sales@mouser.com', '1000 North Main Street, Mansfield, TX 76063', 'https://www.mouser.com'),
            ('Arrow Electronics', 'Bob Wilson', '+1-800-777-2776', 'sales@arrow.com', '100 North 18th Street, Melville, NY 11747', 'https://www.arrow.com')
        ");
        echo "Default suppliers created.\n";
    }
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM components");
    $count = $stmt->fetch()['count'];
    
    if ($count == 0) {
        $db->exec("
            INSERT INTO components (name, part_number, category, package, value, tolerance, voltage_rating, power_rating, description, datasheet_url) VALUES
            ('100Ω Resistor', 'R-0805-100R-1%', 'Resistor', '0805', '100Ω', '±1%', NULL, '1/8W', 'Carbon film resistor, 1/8W, 1% tolerance', 'https://example.com/datasheets/r100.pdf'),
            ('1kΩ Resistor', 'R-0805-1K-1%', 'Resistor', '0805', '1kΩ', '±1%', NULL, '1/8W', 'Carbon film resistor, 1/8W, 1% tolerance', 'https://example.com/datasheets/r1k.pdf'),
            ('10kΩ Resistor', 'R-0805-10K-5%', 'Resistor', '0805', '10kΩ', '±5%', NULL, '1/8W', 'Carbon film resistor, 1/8W, 5% tolerance', 'https://example.com/datasheets/r10k.pdf'),
            ('100nF Capacitor', 'C-0805-100N-50V', 'Capacitor', '0805', '100nF', '±10%', '50V', NULL, 'Ceramic capacitor, 100nF, 50V', 'https://example.com/datasheets/c100n.pdf'),
            ('10µF Capacitor', 'C-0805-10U-25V', 'Capacitor', '0805', '10µF', '±20%', '25V', NULL, 'Electrolytic capacitor, 10µF, 25V', 'https://example.com/datasheets/c10u.pdf'),
            ('1µF Capacitor', 'C-0603-1U-16V', 'Capacitor', '0603', '1µF', '±10%', '16V', NULL, 'Ceramic capacitor, 1µF, 16V', 'https://example.com/datasheets/c1u.pdf'),
            ('LED Red', 'LED-0805-RED', 'LED', '0805', 'Red', NULL, '2.2V', '20mA', 'Surface mount red LED, 0805 package', 'https://example.com/datasheets/led-red.pdf'),
            ('LED Green', 'LED-0805-GREEN', 'LED', '0805', 'Green', NULL, '2.2V', '20mA', 'Surface mount green LED, 0805 package', 'https://example.com/datasheets/led-green.pdf'),
            ('STM32F103C8T6', 'STM32F103C8T6', 'Microcontroller', 'LQFP-48', '72MHz', NULL, '3.3V', NULL, 'ARM Cortex-M3 microcontroller, 64KB Flash, 20KB RAM', 'https://www.st.com/resource/en/datasheet/stm32f103c8.pdf'),
            ('ATmega328P', 'ATMEGA328P-PU', 'Microcontroller', 'DIP-28', '16MHz', NULL, '5V', NULL, 'AVR microcontroller, 32KB Flash, 2KB RAM', 'https://ww1.microchip.com/downloads/en/DeviceDoc/ATmega48A-PA-88A-PA-168A-PA-328-P-DS-DS40002061A.pdf'),
            ('BC547 Transistor', 'BC547', 'Transistor', 'TO-92', 'NPN', NULL, '45V', '500mA', 'NPN general purpose transistor', 'https://example.com/datasheets/bc547.pdf'),
            ('7805 Voltage Regulator', 'MC7805CT', 'Voltage Regulator', 'TO-220', '5V', NULL, '35V', '1A', '5V linear voltage regulator, 1A output', 'https://www.onsemi.com/pdf/datasheet/mc7805-d.pdf'),
            ('LM1117-3.3V', 'LM1117-3.3', 'Voltage Regulator', 'TO-220', '3.3V', NULL, '15V', '800mA', '3.3V linear voltage regulator, 800mA output', 'https://www.ti.com/lit/ds/symlink/lm1117.pdf'),
            ('Diode 1N4001', '1N4001', 'Diode', 'DO-41', NULL, NULL, '50V', '1A', 'General purpose rectifier diode', 'https://example.com/datasheets/1n4001.pdf'),
            ('Zener Diode 5.1V', '1N4733A', 'Diode', 'DO-41', '5.1V', '±5%', '5.1V', '1W', '5.1V zener diode, 1W', 'https://example.com/datasheets/1n4733.pdf')
        ");
        
        for ($i = 1; $i <= 15; $i++) {
            $supplierId = ($i % 3) + 1;
            $qty = rand(50, 500);
            $minStock = rand(10, 50);
            $price = rand(1, 100) / 10;
            
            $db->exec("
                INSERT INTO inventory (component_id, supplier_id, quantity, min_stock, location, unit_price) VALUES
                ($i, $supplierId, $qty, $minStock, 'Shelf-" . chr(65 + ($i % 5)) . "-" . ($i % 10) . "', $price)
            ");
        }
        
        echo "Default components and inventory created.\n";
    }
    
    echo "\nDatabase initialization complete!\n";
    echo "Access the API at: http://localhost:8000\n";
    echo "Login with: admin / admin123\n";
    
} catch (\PDOException $e) {
    die("Error: " . $e->getMessage() . "\n");
}
