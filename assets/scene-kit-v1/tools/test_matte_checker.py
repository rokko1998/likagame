import unittest
import numpy as np
from PIL import Image, ImageDraw
from matte_checker import matte


class MatteChecks(unittest.TestCase):
    def sample(self):
        yy,xx=np.indices((96,96))
        checker=np.where((xx//8+yy//8)%2,232,253).astype('uint8')
        im=Image.fromarray(np.repeat(checker[...,None],3,2))
        draw=ImageDraw.Draw(im)
        draw.rectangle((24,24,72,72),fill=(35,45,60))
        draw.rectangle((38,38,58,58),fill=(251,251,251))
        return im

    def test_removes_both_squares_keeps_enclosed_white_detail(self):
        out,_=matte(self.sample(),min_area=0)
        self.assertEqual(out.getpixel((4,4))[3],0)
        self.assertEqual(out.getpixel((12,4))[3],0)
        self.assertEqual(out.getpixel((48,48)),(251,251,251,255))
        self.assertEqual(out.getpixel((28,28)),(35,45,60,255))

    def test_explicit_hole_seed(self):
        out,_=matte(self.sample(),seeds=[(48,48)],min_area=0)
        self.assertEqual(out.getpixel((48,48))[3],0)
        self.assertEqual(out.getpixel((28,28))[3],255)

    def test_protected_white_part_touching_exterior(self):
        im=self.sample();ImageDraw.Draw(im).rectangle((44,12,52,30),fill='white')
        out,_=matte(im,keeps=[(44,12,9,19)],min_area=0)
        self.assertEqual(out.getpixel((48,17))[3],255)

    def test_no_useful_backdrop_fails_instead_of_erasing_asset(self):
        with self.assertRaises(ValueError):
            matte(Image.new('RGB',(50,50),(30,40,50)))


if __name__=='__main__':unittest.main()
