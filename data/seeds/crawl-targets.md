# 竞品待爬清单（Crawl Target Inventory）

> 生成自 `data/seeds/crawl-inventory.json`（探针实测）。
> 判定口径：SERVER_LIST=服务端渲染出产品列表（可直接 YAML 抓取）；LANDING_ONLY=可达但首屏未列出产品（可能需点进子分类/JS 渲染）；BLOCKED_WAF=反爬拦截；UNREACHABLE=超时/连接失败/证书。

## 总览

| 判定 | 公司数 |
|---|---|
| SERVER_LIST | 32 |
| LANDING_ONLY | 11 |
| BLOCKED_WAF | 6 |
| UNREACHABLE | 10 |

> 说明：Excel 原「竞品品类链接」列本是示范，现已被修正为真实品类/列表 URL（修复 `cellUrl` 误读 `hl.target` 的 bug，提交 d3ac044 之后）。本清单即据此 URL 实测。

## SERVER_LIST（32）

### 碧云天（Beyotime）
- 官网：https://www.beyotime.com/
  - 列表页：https://www.beyotime.com/support/BiochemicalDetection.htm
    - 状态 200 / 275889B / 产品容器 `.item`(×12) / 分页 无 / 价格信号 有
    - 详情示例：www.beyotime.com/goods.do?method=getallcplist&flag=1

### 菲恩生物（FineTest）
- 官网：https://www.fn-test.cn/
  - 列表页：https://www.fn-test.cn/elisa-kits/
    - 状态 200 / 161959B / 产品容器 `a[href*="/product"]`(×57) / 分页 无 / 价格信号 有
    - 详情示例：www.fn-test.cn/product/

### 格锐思（Geruisi）
- 官网：https://www.geruisi-bio.com/
  - 列表页：https://www.geruisi-bio.com/products/463/
    - 状态 200 / 110076B / 产品容器 `a[href*="/product"]`(×173) / 分页 有 / 价格信号 有
    - 详情示例：www.geruisi-bio.com/products/463/

### 海狸（Beaver）
- 官网：https://www.beaverbio.com/
  - 列表页：https://www.beaverbio.com/products/index/952.html
    - 状态 200 / 119692B / 产品容器 `a[href*="/product"]`(×184) / 分页 有 / 价格信号 有
    - 详情示例：www.beaverbio.com/products/cart.html

### 盒子生工（Boxbio）
- 官网：https://www.boxbio.cn/
  - 列表页：https://www.boxbio.cn/products/762/
    - 状态 200 / 162867B / 产品容器 `a[href*="/product"]`(×182) / 分页 有 / 价格信号 有
    - 详情示例：www.boxbio.cn/products/764/

### 华美生物（CUSABIO）
- 官网：https://www.cusabio.cn/
  - 列表页：https://www.cusabio.cn/catalog-30-1.html
    - 状态 200 / 147098B / 产品容器 `a[href*="/catalog"]`(×75) / 分页 无 / 价格信号 有
    - 详情示例：www.cusabio.cn/product.html

### 江莱生物（Jonln）
- 官网：http://www.jonln.com/
  - 列表页：http://www.jonln.com/?article/50.shtml
    - 状态 200 / 52700B / 产品容器 `a[href*="/product"]`(×17) / 分页 无 / 价格信号 有
    - 详情示例：www.jonln.com/products/1534.html

### 金斯瑞（GenScript）
- 官网：https://www.genscript.com/
  - 列表页：https://www.genscript.com/cell-separation-column-and-magnetic-gStand-products.html
    - 状态 200 / 425101B / 产品容器 `a[href*="/product"]`(×15) / 分页 无 / 价格信号 有
    - 详情示例：www.genscript.com/custom-antibody-production-services.html?src=pullmen

### 康宁（Corning）
- 官网：https://www.corning.com/
  - 列表页：https://www.corning.com/cn/zh/products/life-sciences/products/cell-Culture.html
    - 状态 200 / 862660B / 产品容器 `a[href*="/product"]`(×93) / 分页 无 / 价格信号 有
    - 详情示例：www.corning.com/apac/cn/zh/products/life-sciences/resources/customer-h

### 联科生物（Liankebio）
- 官网：https://www.liankebio.com/
  - 列表页：https://www.liankebio.com/product-category/fcm/fcm-antibody
    - 状态 200 / 142670B / 产品容器 `.products li`(×192) / 分页 有 / 价格信号 有
    - 详情示例：www.liankebio.com/products
  - 列表页：https://www.liankebio.com/product-category/elisa/elisa-kit
    - 状态 200 / 123754B / 产品容器 `a[href*="/product"]`(×109) / 分页 有 / 价格信号 有
    - 详情示例：www.liankebio.com/products

### 默克（Merck）
- 官网：https://www.sigmaaldrich.com/
  - 列表页：https://www.sigmaaldrich.cn/CN/zh/products/cell-culture-and-analysis
    - 状态 200 / 792305B / 产品容器 `a[href*="/product"]`(×45) / 分页 无 / 价格信号 有
    - 详情示例：www.sigmaaldrich.cn/CN/zh/products

### 南京诺唯赞生物科技股份有限公司
- 官网：https://www.vazyme.com/
  - 列表页：https://bio.vazyme.com/products_56/22.html
    - 状态 200 / 671460B / 产品容器 `a[href*="/product"]`(×652) / 分页 无 / 价格信号 有
    - 详情示例：bio.vazyme.com/products_3.html

### 诺唯赞 / Vazyme
- 官网：https://bio.vazyme.com/
  - 列表页：https://bio.vazyme.com/products_4/1428441065069035520-0-12.html
    - 状态 200 / 661060B / 产品容器 `a[href*="/product"]`(×672) / 分页 无 / 价格信号 有
    - 详情示例：bio.vazyme.com/products_3.html

### 赛默飞（Thermo Fisher Scientific）
- 官网：https://www.thermofisher.com/
  - 列表页：https://www.thermofisher.com/mx/en/home/life-science/antibodies/ebioscience.html
    - 状态 200 / 558835B / 产品容器 `a[href*="/product"]`(×10) / 分页 有 / 价格信号 有
    - 详情示例：www.thermofisher.com/cn/zh/home/life-science/antibodies.html
  - 列表页：https://www.thermofisher.com/hk/en/home/life-science/antibodies/immunoassays/elisa-kits.html
    - 状态 200 / 627150B / 产品容器 `a[href*="/product"]`(×10) / 分页 无 / 价格信号 有
    - 详情示例：www.thermofisher.com/cn/zh/home/life-science/antibodies.html
  - 列表页：https://www.thermofisher.cn/
    - 状态 200 / 653431B / 产品容器 `a[href*="/product"]`(×14) / 分页 无 / 价格信号 有
    - 详情示例：www.thermofisher.cn/cn/zh/home/life-science/antibodies.html

### 赛业（广州）生物科技有限公司
- 官网：https://www.oricellbio.cn/
  - 列表页：https://www.oricellbio.cn/
    - 状态 200 / 950612B / 产品容器 `a[href*="/product"]`(×877) / 分页 无 / 价格信号 有
    - 详情示例：www.oricellbio.cn/product/SY-iMG-00001.html
  - 列表页：https://www.oricellbio.cn/reagents/mediums.html
    - 状态 200 / 993234B / 产品容器 `a[href*="/product"]`(×946) / 分页 无 / 价格信号 有
    - 详情示例：www.oricellbio.cn/product/SY-iMG-00001.html

### 上海富衡生物科技有限公司
- 官网：https://www.fudancell.com/
  - 列表页：https://www.fudancell.com/sys-col-103/
    - 状态 200 / 173591B / 产品容器 `.item`(×5) / 分页 无 / 价格信号 有

### 斯达特（Starter）
- 官网：https://en.starter-bio.com/
  - 列表页：https://en.starter-bio.com/product.html
    - 状态 200 / 32553B / 产品容器 `a[href*="/product"]`(×4) / 分页 无 / 价格信号 无
    - 详情示例：www.ua-bio.com/goodsList.html?typeld=8&mk_channel=starter_topnav

### 苏州海星生物科技有限公司
- 官网：https://www.cas9x.com/
  - 列表页：https://www.cas9x.com/bdxb
    - 状态 200 / 52924B / 产品容器 `a[href*="/product"]`(×35) / 分页 有 / 价格信号 有
    - 详情示例：www.cas9x.com/product
  - 列表页：https://www.hycyte.com/
    - 状态 200 / 593679B / 产品容器 `.item`(×7) / 分页 无 / 价格信号 有

### 苏州依科赛生物科技股份有限公司
- 官网：https://www.excellbio.com/
  - 列表页：https://www.excellbio.com/
    - 状态 200 / 48915B / 产品容器 `a[href*="/product"]`(×53) / 分页 无 / 价格信号 有
    - 详情示例：www.excellbio.com/productcenter/index.aspx

### Abcam
- 官网：https://www.abcam.com/
  - 列表页：https://www.abcam.com/en-us/products/primary-antibodies
    - 状态 200 / 21950B / 产品容器 `a[href*="/product"]`(×9) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/primary-antibodies/conjugated-antibodies
  - 列表页：https://www.abcam.com/en-us/products/primary-antibodies/monoclonal-recombinant-antibodies
    - 状态 200 / 15081B / 产品容器 `a[href*="/product"]`(×5) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/primary-antibodies/monoclonal-recombinant
  - 列表页：https://www.abcam.com/en-us/products/primary-antibodies/multiclonal-polyclonal
    - 状态 200 / 12158B / 产品容器 `a[href*="/product"]`(×4) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/products/primary-antibodies/multiclonal-polyclonal/rabbi
  - 列表页：https://www.abcam.com/en-us/products/primary-antibodies/flow-cytometry-antibodies
    - 状态 200 / 10480B / 产品容器 `a[href*="/product"]`(×6) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/products/primary-antibodies/conjugated-antibodies
  - 列表页：https://www.abcam.com/en-us/products/elisa-kits-and-immunoassays
    - 状态 200 / 20847B / 产品容器 `a[href*="/product"]`(×4) / 分页 无 / 价格信号 有
    - 详情示例：www.abcam.com/en-us/products/elisa-kits-and-immunoassays/elisa-antibod
  - 列表页：https://www.abcam.com/en-us/products/elisa-kits-and-immunoassays/simplestep-elisa-kits
    - 状态 200 / 10846B / 产品容器 `a[href*="/product"]`(×3) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/products/elisa-kits-and-immunoassays/simplestep-elisa-ki
  - 列表页：https://www.abcam.com/en-us/products/elisa-kits-and-immunoassays/sandwich-elisa-kits
    - 状态 200 / 12650B / 产品容器 `a[href*="/product"]`(×3) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/elisa-kits-and-immunoassays/sandwich-elis
  - 列表页：https://www.abcam.com/en-us/products/biochemical-assays
    - 状态 200 / 14905B / 产品容器 `a[href*="/product"]`(×11) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/biochemical-assays/metabolism-assays
  - 列表页：https://www.abcam.com/en-us/products/biochemical-assays/metabolism-assays
    - 状态 200 / 21457B / 产品容器 `a[href*="/product"]`(×8) / 分页 无 / 价格信号 有
    - 详情示例：www.abcam.com/en-us/products/biochemicals
  - 列表页：https://www.abcam.com/en-us/products/biochemical-assays/cell-health-assays
    - 状态 200 / 21972B / 产品容器 `a[href*="/product"]`(×20) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/selection-guides/cell-viability-dyes-for-
  - 列表页：https://www.abcam.com/en-us/products/biochemical-assays/enzyme-activity-assays
    - 状态 200 / 48593B / 产品容器 `a[href*="/product"]`(×20) / 分页 无 / 价格信号 无
    - 详情示例：www.abcam.com/en-us/products/assay-kits/mitotox-complex-i-oxphos-activ

### ABclonal
- 官网：https://abclonal.com.cn/
  - 列表页：https://abclonal.com.cn/polyclonal-antibodies/
    - 状态 200 / 272134B / 产品容器 `a[href*="/product"]`(×659) / 分页 有 / 价格信号 有
    - 详情示例：abclonal.com.cn/products/
  - 列表页：https://abclonal.com.cn/monoclonal-antibodies/
    - 状态 200 / 321952B / 产品容器 `a[href*="/product"]`(×659) / 分页 有 / 价格信号 有
    - 详情示例：abclonal.com.cn/products/
  - 列表页：https://abclonal.com.cn/smab-recombinant-monoclonal-antibodies/
    - 状态 200 / 160687B / 产品容器 `a[href*="/product"]`(×419) / 分页 无 / 价格信号 有
    - 详情示例：abclonal.com.cn/products/
  - 列表页：https://abclonal.com.cn/flow-cytometry-antibodies/
    - 状态 200 / 211752B / 产品容器 `a[href*="/product"]`(×419) / 分页 无 / 价格信号 有
    - 详情示例：abclonal.com.cn/products/

### ATCC
- 官网：https://www.atcc.org/
  - 列表页：https://www.atcc.org/cell-products
    - 状态 200 / 356736B / 产品容器 `a[href*="/product"]`(×8) / 分页 无 / 价格信号 有
    - 详情示例：www.atcc.org/account/login?returnUrl=/cell-products

### BD Biosciences
- 官网：https://www.bdbiosciences.com/
  - 列表页：https://www.bdbiosciences.com/en-sg/products/reagents/flow-cytometry-reagents/research-reagents
    - 状态 200 / 688896B / 产品容器 `a[href*="/product"]`(×252) / 分页 无 / 价格信号 有
    - 详情示例：www.bdbiosciences.com/en-sg/products/instruments
  - 列表页：https://www.bdbiosciences.com/en-us/products/reagents/cell-preparation-separation-reagents/
    - 状态 200 / 695941B / 产品容器 `a[href*="/product"]`(×239) / 分页 无 / 价格信号 有
    - 详情示例：www.bdbiosciences.com/en-us/products/instruments

### Bio X Cell
- 官网：https://bioxcell.com/
  - 列表页：https://bioxcell.com/in-vivo-antibodies
    - 状态 200 / 1257841B / 产品容器 `a[href*="/catalog"]`(×24) / 分页 无 / 价格信号 有
    - 详情示例：bioxcell.com/catalogsearch/result/?q=Fragments
  - 列表页：https://bioxcell.com/in-vivo-antibodies/invivoplus-antibodies
    - 状态 200 / 1256454B / 产品容器 `a[href*="/catalog"]`(×24) / 分页 无 / 价格信号 有
    - 详情示例：bioxcell.com/catalogsearch/result/?q=Fragments

### BioAssay Systems
- 官网：https://bioassaysys.com/
  - 列表页：https://bioassaysys.com/products/
    - 状态 200 / 330069B / 产品容器 `a[href*="/product"]`(×103) / 分页 有 / 价格信号 有
    - 详情示例：www.fishersci.com/us/en/catalog/search/products?keyword=Bioassay%20Sys

### Capricorn Scientific
- 官网：https://www.capricorn-scientific.com/
  - 列表页：https://www.capricorn-scientific.com/en/products
    - 状态 200 / 86532B / 产品容器 `a[href*="/product"]`(×7) / 分页 无 / 价格信号 有
    - 详情示例：www.capricorn-scientific.com/de/products

### Cytiva
- 官网：https://www.cytivalifesciences.com/
  - 列表页：https://learning.cytivalifesciences.com.cn/product/category/cell-culture-and-fermentation/media-and-feeds/
    - 状态 200 / 725187B / 产品容器 `a[href*="/product"]`(×449) / 分页 无 / 价格信号 有
    - 详情示例：learning.cytivalifesciences.com.cn/product/

### Promega
- 官网：https://www.promega.com.cn/
  - 列表页：https://www.promega.com.cn/products/cell-health-assays/
    - 状态 200 / 292812B / 产品容器 `a[href*="/product"]`(×124) / 分页 无 / 价格信号 有
    - 详情示例：www.promega.com.cn/products/reporter-bioassays/

### Proteintech
- 官网：https://www.ptglab.com/
  - 列表页：https://www.ptglab.com/products/polyclonal-antibodies/
    - 状态 200 / 134614B / 产品容器 `a[href*="/product"]`(×139) / 分页 无 / 价格信号 有
    - 详情示例：www.ptglab.com/products/flow-cytometry-antibodies/
  - 列表页：https://www.ptglab.com/products/monoclonal-antibodies/
    - 状态 200 / 135353B / 产品容器 `a[href*="/product"]`(×128) / 分页 无 / 价格信号 有
    - 详情示例：www.ptglab.com/products/flow-cytometry-antibodies/
  - 列表页：https://www.ptglab.com/products/recombinant-antibodies/
    - 状态 200 / 150206B / 产品容器 `a[href*="/product"]`(×133) / 分页 无 / 价格信号 有
    - 详情示例：www.ptglab.com/products/flow-cytometry-antibodies/
  - 列表页：https://www.ptglab.com/products/flow-cytometry-antibodies/
    - 状态 200 / 116084B / 产品容器 `a[href*="/product"]`(×126) / 分页 无 / 价格信号 有
    - 详情示例：www.ptglab.com/products/flow-cytometry-antibodies/
  - 列表页：https://www.ptglab.com/products/elisa-kits/
    - 状态 200 / 100131B / 产品容器 `a[href*="/product"]`(×125) / 分页 无 / 价格信号 有
    - 详情示例：www.ptglab.com/products/flow-cytometry-antibodies/

### R&D Systems
- 官网：https://www.rndsystems.com/
  - 列表页：https://www.rndsystems.com/products/elisas
    - 状态 200 / 144913B / 产品容器 `a[href*="/product"]`(×64) / 分页 无 / 价格信号 有
    - 详情示例：www.rndsystems.com/products/proteins
  - 列表页：https://www.rndsystems.com/duoset
    - 状态 200 / 102047B / 产品容器 `a[href*="/product"]`(×34) / 分页 无 / 价格信号 有
    - 详情示例：www.rndsystems.com/products/proteins
  - 列表页：https://www.rndsystems.com/quickit
    - 状态 200 / 115371B / 产品容器 `a[href*="/product"]`(×58) / 分页 无 / 价格信号 有
    - 详情示例：www.rndsystems.com/products/proteins

### ScienCell Research Laboratories
- 官网：https://www.sciencellonline.com/
  - 列表页：https://sciencellonline.com/en/products-services/cell-culture-media/
    - 状态 200 / 218627B / 产品容器 `a[href*="/product"]`(×153) / 分页 无 / 价格信号 有
    - 详情示例：sciencellonline.com/en/products-services/

### STEMCELL Technologies
- 官网：https://www.stemcell.com/
  - 列表页：https://www.stemcell.com/products/brands/easysep-cell-separation.html
    - 状态 200 / 337588B / 产品容器 `a[href*="/product"]`(×161) / 分页 无 / 价格信号 有
    - 详情示例：www.stemcell.com/products/product-types.html
  - 列表页：https://www.stemcell.cn/products/product-types/cell-culture-media-and-supplements.html
    - 状态 202 / 2088B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

## LANDING_ONLY（11）

### 赛百慷（上海）生物技术股份有限公司
- 官网：https://www.icellbioscience.com/
  - 列表页：https://www.icellbioscience.com/product
    - 状态 200 / 103906B / 产品容器 `a[href*="/product"]`(×2) / 分页 无 / 价格信号 有
    - 详情示例：www.icellbioscience.com/select_product?id=1&figure=0

### 上海源培生物科技股份有限公司
- 官网：https://www.basalmedia.com/
  - 列表页：https://www.basalmedia.com/
    - 状态 200 / 124305B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
    - 详情示例：www.basalmedia.com/productlist_502.html

### 上海中乔新舟生物科技有限公司
- 官网：https://www.zqxzbio.com/
  - 列表页：https://www.zqxzbio.com/Index/pro.html
    - 状态 200 / 27929B / 产品容器 `-`(×0) / 分页 有 / 价格信号 有

### 四正柏（4A Biotech）
- 官网：http://www.4abio.com/
  - 列表页：http://www.4abio.com/Product/ELISAkits-and-reagents/FC-kits
    - 状态 200 / 89914B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
    - 详情示例：www.4abio.com/Product/clinical-flow-cytometry/flow-antibodies?id=907b2

### 苏州双洳生物科技有限公司
- 官网：https://www.lonsera.cn/
  - 列表页：https://www.lonsera.cn/list_11/
    - 状态 200 / 158509B / 产品容器 `-`(×0) / 分页 有 / 价格信号 有

### 同仁化学（Dojindo）
- 官网：https://www.dojindo.cn/
  - 列表页：https://www.dojindo.cn/#/index
    - 状态 200 / 13161B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有

### ACROBiosystems
- 官网：https://www.acrobiosystems.com/
  - 列表页：https://www.acrobiosystems.com/category/kits-assay-reagents/elisa-kit
    - 状态 200 / 110310B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
  - 列表页：https://www.acrobiosystems.com/category/recombinant-proteins
    - 状态 200 / 110310B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有

### Cayman Chemical
- 官网：https://www.caymanchem.com/
  - 列表页：https://www.caymanchem.com/assays
    - 状态 200 / 2327B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### Leinco
- 官网：https://www.leinco.com/
  - 列表页：https://www.leinco.com/primary-monoclonal-antibodies/
    - 状态 200 / 844B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### RayBiotech
- 官网：https://www.raybiotech.com/
  - 列表页：https://www.raybiotech.com/elisa-kits
    - 状态 200 / 675109B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
    - 详情示例：www.raybiotech.com/elisa-kits-products

### Selleck
- 官网：https://www.selleckchem.com/
  - 列表页：https://www.selleckchem.com/screening-libraries.html
    - 状态 200 / 128946B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
    - 详情示例：www.selleckchem.com/newproducts.html
  - 列表页：https://www.selleckchem.com/selleckcatalog.html
    - 状态 200 / 80885B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
    - 详情示例：www.selleck.au/selleckcatalog.html

## BLOCKED_WAF（6）

### 华安生物（HUABIO）
- 官网：https://huabio.cn/
  - 列表页：https://huabio.cn/collections/primary-antibodies
    - 状态 200 / 174339B / 产品容器 `a[href*="/product"]`(×2) / 分页 无 / 价格信号 有
    - 详情示例：huabio.cn/pages/products
  - 列表页：https://huabio.cn/collections/flow-cytometry-antibody
    - 状态 200 / 174361B / 产品容器 `a[href*="/product"]`(×2) / 分页 无 / 价格信号 有
    - 详情示例：huabio.cn/pages/products
  - 列表页：https://huabio.cn/collections/elisa-assay-kit
    - 状态 200 / 174391B / 产品容器 `a[href*="/product"]`(×2) / 分页 无 / 价格信号 有
    - 详情示例：huabio.cn/pages/products

### 近岸蛋白（Novoprotein）
- 官网：https://www.novoprotein.com.cn/
  - 列表页：https://www.novoprotein.com.cn/products
    - 状态 200 / 116312B / 产品容器 `a[href*="/product"]`(×1) / 分页 无 / 价格信号 有
    - 详情示例：www.novoprotein.com.cn/products

### 上海逍鹏生物科技有限公司
- 官网：https://www.xpbiomed.com/
  - 列表页：https://www.xpbiomed.com/Products/index.aspx?lcid=1
    - 状态 200 / 85310B / 产品容器 `-`(×0) / 分页 有 / 价格信号 有
    - 详情示例：www.xpbiomed.com/Products/index.aspx?lcid=270
  - 列表页：https://www.xpbiomed.com/Products/index.aspx?lcid=5
    - 状态 200 / 81286B / 产品容器 `-`(×0) / 分页 有 / 价格信号 有
    - 详情示例：www.xpbiomed.com/Products/index.aspx?lcid=270

### 同立海源
- 官网：https://www.seafrom.com/
  - 列表页：https://www.seafrom.com/Product-center.html
    - 状态 200 / 22297B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有

### CST（Cell Signaling Technology）
- 官网：https://www.cellsignal.com/
  - 列表页：https://www.cellsignal.com/browse?tab=product&categories=Primary%20Antibodies
    - 状态 200 / 186857B / 产品容器 `a[href*="/product"]`(×1) / 分页 无 / 价格信号 有
    - 详情示例：www.cellsignal.com/product-information/promotions
  - 列表页：https://www.cellsignal.com/browse?tab=product&categories=Rabbit%20Monoclonal%20Antibodies
    - 状态 200 / 174201B / 产品容器 `a[href*="/product"]`(×1) / 分页 无 / 价格信号 有
    - 详情示例：www.cellsignal.com/product-information/promotions

### Miltenyi Biotec
- 官网：https://www.miltenyibiotec.com/
  - 列表页：https://www.miltenyibiotec.com/US-en/products/macs-cell-separation.html
    - 状态 200 / 31673B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无
  - 列表页：https://www.miltenyibiotec.com/US-en/products/macs-cell-separation/cell-separation-reagents.html
    - 状态 200 / 31673B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

## UNREACHABLE（10）

### 南京森贝伽生物科技有限公司
- 官网：http://www.senbeijia.com/
  - 列表页：http://www.senbeijia.com/category.php?id=58
    - 状态 403 / 247B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### 厦门逸漠生物科技有限公司
- 官网：http://immocell.com/
  - 列表页：http://immocell.com/
    - 状态 403 / 110B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### 索莱宝（Solarbio）
- 官网：https://www.solarbio.com/
  - 列表页：https://www.elabox.cn/ElaBoX
    - 状态 ERR:fetch failed / 0B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无
  - 列表页：https://www.solarbio.com/categoryList?id=49
    - 状态 ERR:fetch failed / 0B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### 义翘神州（Sino Biological）
- 官网：https://www.sinobiological.com/
  - 列表页：https://www.sinobiological.com/category/protein
    - 状态 403 / 5807B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### 浙江美森细胞科技有限公司
- 官网：https://ctcc.online/index.aspx
  - 列表页：https://ctcc.online/ProductCenter/index.aspx
    - 状态 ERR:fetch failed / 0B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无
  - 列表页：https://ctcc.online/CellCultureReagents/index.aspx?lcid=40
    - 状态 ERR:fetch failed / 0B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### Beckman Coulter
- 官网：https://www.beckman.com/
  - 列表页：https://www.beckman.com/reagents/coulter-flow-cytometry/antibodies-and-kits
    - 状态 403 / 5921B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### BioLegend
- 官网：https://www.biolegend.com/
  - 列表页：https://www.biolegend.com/en-us/flow-cytometry
    - 状态 403 / 5873B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无
  - 列表页：https://www.biolegend.com/en-us/mojosort
    - 状态 403 / 5855B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有
  - 列表页：https://www.biolegend.com/en-us/cell-culture/functional-antibodies
    - 状态 403 / 5954B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### Cytion
- 官网：https://www.cytion.com/
  - 列表页：https://www.cytion.com/us
    - 状态 ERR:fetch failed / 0B / 产品容器 `-`(×0) / 分页 无 / 价格信号 无

### MedChemExpress（MCE）
- 官网：https://www.medchemexpress.cn/
  - 列表页：https://www.medchemexpress.cn/kits/cell-isolation.html
    - 状态 412 / 3191B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有

### PromoCell
- 官网：https://www.promocell.com/
  - 列表页：https://promocell.com/fr_fr/products/cell-types/
    - 状态 403 / 5488B / 产品容器 `-`(×0) / 分页 无 / 价格信号 有

