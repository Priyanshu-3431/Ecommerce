require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Coupon = require('../models/Coupon');
const Banner = require('../models/Banner');
const GiftCard = require('../models/GiftCard');
const FlashSale = require('../models/FlashSale');

const products = require('./products.json');

// ===============================
// HELPER
// ===============================
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ===============================
// SEED
// ===============================
(async () => {
  try {
    // ===============================
    // MONGODB CONNECTION
    // ===============================
    const mongoUri =
      process.env.MONGODB_URI ||
      'mongodb://127.0.0.1:27017/shopverse';

    await mongoose.connect(mongoUri);

    console.log('MongoDB connected');
    console.log(`Database: ${mongoose.connection.name}`);

    // ===============================
    // OLD ROLE CLEANUP
    // ===============================
    await User.updateMany(
      { role: 'user' },
      {
        $set: {
          role: 'customer'
        }
      }
    );

    await User.deleteMany({
      role: {
        $in: ['seller', 'delivery']
      }
    });

    console.log('Old seller/delivery roles cleaned');

    // ===============================
    // REMOVE LEGACY ORDER INDEX
    // ===============================
    try {
      await mongoose.connection
        .collection('orders')
        .dropIndex('orderId_1');

      console.log('Removed legacy orderId_1 index');
    } catch (e) {
      if (
        e.codeName !== 'IndexNotFound' &&
        e.code !== 27 &&
        e.codeName !== 'NamespaceNotFound' &&
        e.code !== 26
      ) {
        console.log(
          'Legacy order index check:',
          e.message
        );
      }
    }

    // ===============================
    // REMOVE LEGACY MOBILE INDEX
    // ===============================
    try {
      await mongoose.connection
        .collection('users')
        .dropIndex('mobile_1');

      console.log('Removed legacy mobile_1 index');
    } catch (e) {
      if (
        e.codeName !== 'IndexNotFound' &&
        e.code !== 27
      ) {
        console.log(
          'Legacy mobile index check:',
          e.message
        );
      }
    }

    // ===============================
    // PRODUCTS
    // ===============================
    for (const p of products) {
      await Product.updateOne(
        { sku: p.sku },
        {
          $set: p
        },
        {
          upsert: true
        }
      );
    }

    console.log(
      `Products seeded: ${products.length}`
    );

    // ===============================
    // ADMIN ACCOUNT
    // ===============================

    const adminEmail =
      process.env.ADMIN_EMAIL ||
      'priyanshu73980@gmail.com';

    const adminPassword =
      process.env.ADMIN_PASSWORD ||
      'Raj@341';

    const adminHash = await bcrypt.hash(
      adminPassword,
      12
    );

    /*
      IMPORTANT:
      Agar admin email pehle kisi customer account
      me registered hai to duplicate-key error aa sakta hai.

      Isliye same email wale NON-ADMIN account ko
      pehle remove kiya ja raha hai.
    */

    await User.deleteMany({
      email: adminEmail,
      role: {
        $ne: 'admin'
      }
    });

    // Existing admin check
    let admin = await User.findOne({
      role: 'admin'
    });

    if (admin) {
      admin.name = 'ShopVerse Admin';
      admin.email = adminEmail;
      admin.password = adminHash;
      admin.role = 'admin';

      await admin.save();

      console.log('Existing admin updated');
    } else {
      await User.create({
        name: 'ShopVerse Admin',
        email: adminEmail,
        password: adminHash,
        role: 'admin'
      });

      console.log('New admin created');
    }

    // ===============================
    // CATEGORIES
    // ===============================
    const categories = [
      ...new Set(
        products
          .map((x) => x.category)
          .filter(Boolean)
      )
    ];

    for (const name of categories) {
      await Category.updateOne(
        { name },
        {
          $setOnInsert: {
            name,
            slug: slug(name),
            active: true
          }
        },
        {
          upsert: true
        }
      );
    }

    console.log(
      `Categories ready: ${categories.length}`
    );

    // ===============================
    // BRANDS
    // ===============================
    const brands = [
      ...new Set(
        products
          .map((x) => x.brand)
          .filter(Boolean)
      )
    ];

    for (const name of brands) {
      await Brand.updateOne(
        { name },
        {
          $setOnInsert: {
            name,
            slug: slug(name),
            active: true
          }
        },
        {
          upsert: true
        }
      );
    }

    console.log(
      `Brands ready: ${brands.length}`
    );

    // ===============================
    // COUPON - WELCOME10
    // ===============================
    await Coupon.updateOne(
      {
        code: 'WELCOME10'
      },
      {
        $set: {
          code: 'WELCOME10',
          type: 'PERCENT',
          value: 10,
          minOrder: 499,
          maxDiscount: 500,
          active: true,
          perUserLimit: 1
        }
      },
      {
        upsert: true
      }
    );

    // ===============================
    // COUPON - SAVE200
    // ===============================
    await Coupon.updateOne(
      {
        code: 'SAVE200'
      },
      {
        $set: {
          code: 'SAVE200',
          type: 'FLAT',
          value: 200,
          minOrder: 1499,
          active: true,
          perUserLimit: 5
        }
      },
      {
        upsert: true
      }
    );

    console.log('Coupons ready');

    // ===============================
    // HOMEPAGE BANNERS
    // ===============================
    const banners = [
      {
        title: 'Big Mobile Upgrade',
        subtitle:
          'Premium smartphones & accessories',

        image:
          'https://loremflickr.com/1600/600/smartphone,shopping/all?lock=6101',

        link:
          '/products.html?category=Smartphones',

        position: 1
      },

      {
        title: 'Laptop Power Days',
        subtitle:
          'Performance for study, work & play',

        image:
          'https://loremflickr.com/1600/600/laptop,technology/all?lock=6102',

        link:
          '/products.html?category=Laptops',

        position: 2
      },

      {
        title: 'Style Reloaded',
        subtitle:
          'Fresh fashion picks',

        image:
          'https://loremflickr.com/1600/600/fashion,model/all?lock=6103',

        link:
          "/products.html?category=Men's%20Fashion",

        position: 3
      },

      {
        title: 'Home Refresh',
        subtitle:
          'Make every room better',

        image:
          'https://loremflickr.com/1600/600/interior,home/all?lock=6104',

        link:
          '/products.html?category=Home',

        position: 4
      },

      {
        title: 'Sound Sale',
        subtitle:
          'Headphones, earbuds & speakers',

        image:
          'https://loremflickr.com/1600/600/headphones,music/all?lock=6105',

        link:
          '/products.html?category=Headphones',

        position: 5
      },

      {
        title: 'Gaming Arena',
        subtitle:
          'Gear up to win',

        image:
          'https://loremflickr.com/1600/600/gaming,computer/all?lock=6106',

        link:
          '/products.html?category=Gaming',

        position: 6
      }
    ];

    for (const b of banners) {
      await Banner.updateOne(
        {
          position: b.position
        },
        {
          $set: b
        },
        {
          upsert: true
        }
      );
    }

    console.log('Banners ready');

    // ===============================
    // DEMO GIFT CARD
    // ===============================
    await GiftCard.updateOne(
      {
        code: 'DEMO500'
      },
      {
        $setOnInsert: {
          code: 'DEMO500',
          initialBalance: 500,
          balance: 500,
          active: true
        }
      },
      {
        upsert: true
      }
    );

    console.log('Gift card ready');

    // ===============================
    // DEMO FLASH SALE
    // ===============================
    const firstProduct =
      await Product.findOne({
        stock: {
          $gt: 0
        }
      });

    if (firstProduct) {
      await FlashSale.updateOne(
        {
          name: 'Demo Flash Sale'
        },
        {
          $setOnInsert: {
            name: 'Demo Flash Sale',

            products: [
              {
                product:
                  firstProduct._id,

                salePrice:
                  Math.max(
                    1,
                    Math.floor(
                      firstProduct.price *
                        0.9
                    )
                  ),

                quantity: 10
              }
            ],

            startAt:
              new Date(
                Date.now() -
                  60 * 60 * 1000
              ),

            endAt:
              new Date(
                Date.now() +
                  7 *
                    24 *
                    60 *
                    60 *
                    1000
              ),

            active: true
          }
        },
        {
          upsert: true
        }
      );
    }

    console.log('Flash sale ready');

    // ===============================
    // COMPLETE
    // ===============================

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      '       SHOPVERSE SEED COMPLETE'
    );

    console.log(
      '======================================'
    );

    console.log(
      `Database : ${mongoose.connection.name}`
    );

    console.log(
      `Admin    : ${adminEmail}`
    );

    console.log(
      'Admin account successfully configured'
    );

    console.log(
      '======================================'
    );

  } catch (error) {
    console.error('');
    console.error('SEED ERROR:');
    console.error(error);

    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();

    console.log(
      'MongoDB disconnected'
    );
  }
})();