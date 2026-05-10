<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Lens
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $brand = null;

    #[ORM\Column(length: 255)]
    private ?string $model = null;

    #[ORM\Column(length: 100)]
    private ?string $mountType = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 1)]
    private ?float $focalLength = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 1, nullable: true)]
    private ?float $maxAperture = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 1, nullable: true)]
    private ?float $minAperture = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $productionYear = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $condition = null;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true)]
    private ?float $purchasePrice = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $purchaseDate = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $serialNumber = null;

    #[ORM\Column(type: 'boolean')]
    private bool $hasAutoFocus = false;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTimeInterface $updatedAt = null;

    #[ORM\OneToMany(mappedBy: 'lens', targetEntity: SamplePhoto::class, cascade: ['persist', 'remove'])]
    private Collection $samplePhotos;

    #[ORM\OneToMany(mappedBy: 'lens', targetEntity: MaintenanceRecord::class, cascade: ['persist', 'remove'])]
    private Collection $maintenanceRecords;

    public function __construct()
    {
        $this->samplePhotos = new ArrayCollection();
        $this->maintenanceRecords = new ArrayCollection();
        $this->createdAt = new \DateTime();
        $this->updatedAt = new \DateTime();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getBrand(): ?string
    {
        return $this->brand;
    }

    public function setBrand(string $brand): self
    {
        $this->brand = $brand;
        return $this;
    }

    public function getModel(): ?string
    {
        return $this->model;
    }

    public function setModel(string $model): self
    {
        $this->model = $model;
        return $this;
    }

    public function getMountType(): ?string
    {
        return $this->mountType;
    }

    public function setMountType(string $mountType): self
    {
        $this->mountType = $mountType;
        return $this;
    }

    public function getFocalLength(): ?float
    {
        return $this->focalLength;
    }

    public function setFocalLength(float $focalLength): self
    {
        $this->focalLength = $focalLength;
        return $this;
    }

    public function getMaxAperture(): ?float
    {
        return $this->maxAperture;
    }

    public function setMaxAperture(?float $maxAperture): self
    {
        $this->maxAperture = $maxAperture;
        return $this;
    }

    public function getMinAperture(): ?float
    {
        return $this->minAperture;
    }

    public function setMinAperture(?float $minAperture): self
    {
        $this->minAperture = $minAperture;
        return $this;
    }

    public function getProductionYear(): ?int
    {
        return $this->productionYear;
    }

    public function setProductionYear(?int $productionYear): self
    {
        $this->productionYear = $productionYear;
        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): self
    {
        $this->description = $description;
        return $this;
    }

    public function getCondition(): ?string
    {
        return $this->condition;
    }

    public function setCondition(?string $condition): self
    {
        $this->condition = $condition;
        return $this;
    }

    public function getPurchasePrice(): ?float
    {
        return $this->purchasePrice;
    }

    public function setPurchasePrice(?float $purchasePrice): self
    {
        $this->purchasePrice = $purchasePrice;
        return $this;
    }

    public function getPurchaseDate(): ?\DateTimeInterface
    {
        return $this->purchaseDate;
    }

    public function setPurchaseDate(\DateTimeInterface $purchaseDate): self
    {
        $this->purchaseDate = $purchaseDate;
        return $this;
    }

    public function getSerialNumber(): ?string
    {
        return $this->serialNumber;
    }

    public function setSerialNumber(?string $serialNumber): self
    {
        $this->serialNumber = $serialNumber;
        return $this;
    }

    public function isHasAutoFocus(): bool
    {
        return $this->hasAutoFocus;
    }

    public function setHasAutoFocus(bool $hasAutoFocus): self
    {
        $this->hasAutoFocus = $hasAutoFocus;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeInterface
    {
        return $this->createdAt;
    }

    public function setCreatedAt(\DateTimeInterface $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?\DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeInterface $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }

    public function getSamplePhotos(): Collection
    {
        return $this->samplePhotos;
    }

    public function addSamplePhoto(SamplePhoto $samplePhoto): self
    {
        if (!$this->samplePhotos->contains($samplePhoto)) {
            $this->samplePhotos->add($samplePhoto);
            $samplePhoto->setLens($this);
        }
        return $this;
    }

    public function removeSamplePhoto(SamplePhoto $samplePhoto): self
    {
        if ($this->samplePhotos->removeElement($samplePhoto)) {
            if ($samplePhoto->getLens() === $this) {
                $samplePhoto->setLens(null);
            }
        }
        return $this;
    }

    public function getMaintenanceRecords(): Collection
    {
        return $this->maintenanceRecords;
    }

    public function addMaintenanceRecord(MaintenanceRecord $maintenanceRecord): self
    {
        if (!$this->maintenanceRecords->contains($maintenanceRecord)) {
            $this->maintenanceRecords->add($maintenanceRecord);
            $maintenanceRecord->setLens($this);
        }
        return $this;
    }

    public function removeMaintenanceRecord(MaintenanceRecord $maintenanceRecord): self
    {
        if ($this->maintenanceRecords->removeElement($maintenanceRecord)) {
            if ($maintenanceRecord->getLens() === $this) {
                $maintenanceRecord->setLens(null);
            }
        }
        return $this;
    }
}
